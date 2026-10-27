import * as auth from '@/lib/auth'
import * as photoStorage from '@/lib/storage/messenger-images'
import { GET as getMessengerImage } from '@/app/api/messenger-images/[id]/route'
import * as photoDelivery from '@/lib/messenger/photos'
import { REALITY_CONTENT_VERSION } from '@miro/providers'
import { REPLY_DISPOSITION_VERSION } from '@/lib/messenger/reply-disposition'
import { ATTENTION_VERSION } from '@/lib/messenger/attention'
import { receiveMessenger, runMessengerInbox, messengerItems, replyPauseMs } from '@/lib/messenger/inbox'
import { conversationRequests, messengerInbox } from '@miro/db'
import { AGENCY_PLANNER_VERSION, CHARACTER_LIFE_VERSION } from '@miro/engine'
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  db, users, userSettings, characters, contactProfiles, roleplaySessions, worldStates, relationships, events,
  generatedMedia, messages, memories, realityContacts, characterRevisions, characterRuntimeStates, characterDecisions, stateTransitions, characterLifeEvents,
} from '@miro/db'
import { createAgencyState, type AgencyAction, type CompiledCharacter } from '@miro/domain'
import { hashAuthoredCharacter } from '@miro/engine'
import * as providers from '@miro/providers'
import { POLICY } from '@miro/config'
import { authoredDocument } from '@/lib/agency/authored'
import { loadAgencyEvidence, loadAgencyRuntime } from '@/lib/agency/runtime'
import { advanceCharacterLife } from '@/lib/agency/life'
import * as receipts from '@/lib/agency/receipts'
import { loadSession } from '@/lib/simulation/snapshot'
import { evaluateSession } from '../evaluate'
import { evaluateAgencyReality } from '../agency'
import { agencyDueCondition } from '../scheduler'
import * as push from '../push-outbox'
import { cloneAsReality, dropRealityClones } from './fixtures'

const NOW = new Date('2026-09-24T05:00:00.000Z') // 14:00 KST, within configured activity hours.
const BEFORE = new Date(NOW.getTime() - 60_000)
const describeDb = process.env.DATABASE_URL ? describe : describe.skip

/** Synthetic provider outputs exercise the real planner, reducer, verifier and DB boundary. */
function provider(opts: { action?: AgencyAction; reject?: boolean; rejectFirst?: boolean; relationship?: boolean; goalIds?: string[]; duringRender?: () => Promise<void>; life?: unknown[]; failDisposition?: boolean; closeReply?: boolean; attention?: 'read' | 'defer' | 'leave_unread'; duringAttention?: () => Promise<void> } = {}) {
  const calls: Array<{ version: string; prompt: string; system: string }> = []
  const llm: providers.LLMProvider = {
    info: { mode: 'mock', name: 'agency-reality-recorded', notice: 'Synthetic contract validation, not live model evaluation.' },
    async generateStructured(request) {
      const version = request.promptVersion ?? ''
      calls.push({ version, prompt: request.prompt, system: request.system })
      if (version === ATTENTION_VERSION) {
        await opts.duringAttention?.()
        return request.schema.parse({ action: opts.attention ?? 'read', reason: '이 인물의 성향과 이미 쌓인 관계로 연락을 확인할지 선택한다.',
          recheckMinutes: opts.attention === 'defer' ? 10 : null, ruleIds: ['personality'], evidenceIds: [] })
      }
      if (version === 'agency-communication-check:v8') {
        const payload = JSON.parse(request.prompt)
        return request.schema.parse({ complete: true, blocks: payload.blocks.map((b: { index: number }) => ({
          blockIndex: b.index, noUserClaims: true, boundaryViolation: false, claims: [] })) })
      }
      if (version === REPLY_DISPOSITION_VERSION) {
        if (opts.failDisposition) throw new Error('provider_http_503')
        const last = JSON.parse(request.prompt).messages.at(-1)
        return request.schema.parse({ disposition: opts.closeReply ? 'close' : 'retry', reason: opts.closeReply ? 'acknowledgement' : 'unanswered',
          sourceId: opts.closeReply ? last.id : '', quote: opts.closeReply ? last.text : '' })
      }
      if (version === AGENCY_PLANNER_VERSION) {
        const context = JSON.parse(request.prompt)
        const evidenceId = context.evidence.find((item: { actor: string }) => item.actor === 'user')?.id
        const refs = evidenceId ? [evidenceId] : []
        const action = opts.action ?? 'contact'
        return request.schema.parse({
          appraisal: { interpretation: '사용자가 대화 가능 여부를 물었다.', evidenceIds: refs, ruleIds: ['personality'],
            goalCongruence: 0, valueConflict: 0, responsibility: 'uncertain',
            affectDelta: { valence: 1, arousal: 0, stress: 0, energy: 0 }, expression: { openness: 30, directness: 60 }, beliefs: [],
            ...(opts.relationship ? { relationshipChanges: [{ dimension: 'trust', delta: 2, evidenceIds: refs, ruleIds: ['personality'] }] } : {}),
          },
          candidates: [{ id: 'choice', action, targetActor: context.actor,
            description: action === 'wait' ? '지금은 연락하지 않고 기다린다.' : '대화할 수 있는지 짧게 묻는다.',
            evidenceIds: refs, ruleIds: ['personality'], goalIds: opts.goalIds ?? [],
            // Sending the contact carries out the cited goals; waiting never does.
            fulfillsGoalIds: action === 'contact' ? opts.goalIds ?? [] : [],
            ruleFit: [{ ruleId: 'personality', fit: 1 }], goalFit: [], uncertainty: 0, cost: 0,
            preconditions: action === 'contact' ? [{ kind: 'capability', capability: 'message' }] : [],
          }], newGoals: [], goalChanges: [],
        })
      }
      if (version === CHARACTER_LIFE_VERSION) return request.schema.parse({ events: opts.life ?? [] })
      if (version === REALITY_CONTENT_VERSION) {
        await opts.duringRender?.()
        const first = calls.filter(call => call.version === version).length === 1
        return request.schema.parse({ text: opts.rejectFirst && first ? '우유를 데워 뒀습니다.' : '잠깐 이야기할 수 있을까요?', tone: 'neutral' })
      }
      if (version === 'agency-realization-check:v5') {
        const context = JSON.parse(request.prompt)
        const reject = opts.reject || (opts.rejectFirst && calls.filter(call => call.version === version).length === 1)
        return request.schema.parse({ decisionId: context.decision.id, aligned: !reject, claims: [], unsupported: [],
          violations: reject ? ['unsupported_success'] : [],
        })
      }
      throw new Error(`Unexpected fixture request: ${version}`)
    },
  }
  vi.spyOn(providers, 'createAI').mockReturnValue(llm as ReturnType<typeof providers.createAI>)
  return { llm, calls }
}

describeDb('Reality agency — shared decision and atomic delivery', () => {
  const owners: string[] = []
  beforeEach(() => {
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'live')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', '*')
    vi.spyOn(push, 'deliverRealityPush').mockResolvedValue(0)
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
  afterAll(async () => {
    for (const id of owners) await db.delete(users).where(eq(users.id, id))
    await dropRealityClones()
  })

  async function fixture() {
    const [owner] = await db.insert(users).values({ email: `agency-reality-${randomUUID()}@miro.dev` }).returning()
    owners.push(owner!.id)
    const character = await cloneAsReality('thomas', { ownerId: owner!.id })
    await db.update(contactProfiles).set({ activeHoursStart: '00:00', activeHoursEnd: '23:59', enabled: true })
      .where(eq(contactProfiles.characterId, character.id))
    await db.insert(userSettings).values({ userId: owner!.id, timeZone: 'Asia/Seoul' })
    const [session] = await db.insert(roleplaySessions).values({ userId: owner!.id, characterId: character.id, worldId: character.worldId,
      lastInteractionAt: BEFORE, pendingRealityIntent: { channel: 'video_call', reason: 'legacy should not choose this action', urgency: 1 },
    }).returning()
    await db.insert(worldStates).values({ sessionId: session!.id, currentLocation: '공방', currentTime: '오후' })
    await db.insert(relationships).values({ sessionId: session!.id, ...character.initial })
    const [utterance] = await db.insert(messages).values({ sessionId: session!.id, role: 'user', kind: 'text',
      content: '지금 이야기할 수 있어요?', turnIndex: 0, createdAt: NOW,
    }).returning()
    const loaded = await loadSession(session!.id, owner!.id)
    const snapshot = loaded!.snapshot
    const authored = authoredDocument(snapshot.character, snapshot.worldSetting, [], snapshot.worldGenre)
    const sourceHash = hashAuthoredCharacter(authored)
    const statement = authored.fields['personality.personality']!
    const compiled: CompiledCharacter = { version: 1, sourceHash, rules: [{ id: 'personality', domain: 'value', statement,
      source: { field: 'personality.personality', start: 0, end: statement.length }, origin: 'explicit', confidence: 1, priority: 1 }] }
    const [revision] = await db.insert(characterRevisions).values({ characterId: character.id, sourceHash, authored, compiled,
      profile: { character: snapshot.character, worldSetting: snapshot.worldSetting, worldGenre: snapshot.worldGenre }, status: 'ready', providerMode: 'mock',
    }).returning()
    await db.insert(characterRuntimeStates).values({ sessionId: session!.id, revisionId: revision!.id, mode: 'live',
      state: createAgencyState(revision!.id, BEFORE.toISOString()),
    })
    return { id: session!.id, userId: owner!.id, characterId: character.id, revisionId: revision!.id, messageId: utterance!.id, snapshot }
  }
  async function stored(id: string) {
    const [runtime] = await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, id))
    return { runtime: runtime!,
      contacts: await db.select().from(realityContacts).where(eq(realityContacts.sessionId, id)),
      messages: await db.select().from(messages).where(and(eq(messages.sessionId, id), eq(messages.kind, 'reality_message'))),
      decisions: await db.select().from(characterDecisions).where(eq(characterDecisions.sessionId, id)),
    }
  }

  // 10/2 자기 삶: 대화가 없던 시간에 깨어 있던 블록에서 겪은 일만 남기고, 다음 배경 판단이 그것을 자기 경험(ownDay)으로 본다.
  it('lives the quiet hours, keeps only awake in-window events, and hands them to the next background review as its own day', async () => {
    const { id, characterId } = await fixture()
    await db.update(contactProfiles).set({ routine: { version: 1, source: 'authored', note: null, generatedAt: NOW.toISOString(), blocks: [
      { days: [], start: '00:00', end: '07:00', label: '수면', availability: 'unreachable' },
      { days: [], start: '09:00', end: '18:00', label: '근무', availability: 'busy' }] } }).where(eq(contactProfiles.characterId, characterId))
    const later = new Date(NOW.getTime() + 5 * 3_600_000) // 19:00 KST
    const { calls } = provider({ action: 'wait', life: [
      { at: '2026-09-24T16:30:00+09:00', kind: 'work', summary: '오후 작업 중 손님이 두고 간 우산을 찾아 돌려줬다.', valence: 0.3, intensity: 0.4, shareable: true },
      { at: '2026-09-24T03:00:00+09:00', kind: 'rest', summary: '창밖 소리에 잠이 깼다.', valence: 0, intensity: 0.2, shareable: false },
    ] })
    const lived = await advanceCharacterLife(id, later)
    expect(lived.outcome).toBe('lived')
    expect(lived.events!.map(e => [e.block, e.summary])).toEqual([['근무', '오후 작업 중 손님이 두고 간 우산을 찾아 돌려줬다.']])
    expect(await advanceCharacterLife(id, later)).toEqual({ outcome: 'not_due' })
    const [runtime] = await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, id))
    expect(runtime!.lifeUntil?.toISOString()).toBe(later.toISOString())
    expect(await evaluateSession(id, later)).toEqual({ outcome: 'no_intent' })
    const payload = JSON.parse(calls.find(c => c.version === AGENCY_PLANNER_VERSION)!.prompt)
    const own = payload.evidence.find((e: { id: string }) => e.id === `life:${lived.events![0]!.id}`)
    expect(own).toMatchObject({ kind: 'event', epistemic: 'observed', actor: characterId, knownTo: [characterId], shareable: true })
    expect(JSON.parse(payload.input).ownDay).toEqual([own.id])
  })

  it('keeps a day worth sharing for later instead of asking while the character cannot send', async () => {
    const { id, characterId, revisionId } = await fixture()
    await db.update(roleplaySessions).set({ pendingRealityIntent: null }).where(eq(roleplaySessions.id, id))
    // 마지막 판단이 사용자 말 뒤에 끝났다 — 새로 깨울 것은 자기 삶의 일뿐이다.
    await db.update(characterRuntimeStates).set({ state: { ...createAgencyState(revisionId, NOW.toISOString()), sequence: 1 } }).where(eq(characterRuntimeStates.sessionId, id))
    await db.update(contactProfiles).set({ routine: { version: 1, source: 'authored', note: null, generatedAt: NOW.toISOString(), blocks: [
      { days: [], start: '09:00', end: '18:00', label: '근무', availability: 'busy' }] } }).where(eq(contactProfiles.characterId, characterId))
    await db.insert(characterLifeEvents).values({ sessionId: id, occurredAt: new Date(NOW.getTime() + 3_600_000), block: '근무', kind: 'work',
      summary: '손님이 두고 간 우산을 찾아 돌려줬다.', valence: 0.3, intensity: 0.5, shareable: true })
    const { calls } = provider({ action: 'wait' })
    // 16:00 KST 근무 중 — 보낼 수 없으니 묻지 않는다. 일은 새것으로 남는다.
    expect(await evaluateSession(id, new Date(NOW.getTime() + 2 * 3_600_000))).toEqual({ outcome: 'suppressed', reason: 'busy' })
    expect(calls).toHaveLength(0)
    // 19:00 KST 퇴근 뒤 — 이제 판단한다(이번엔 기다리기로).
    expect(await evaluateSession(id, new Date(NOW.getTime() + 5 * 3_600_000))).toEqual({ outcome: 'no_intent' })
    expect(calls.map(c => c.version)).toEqual([AGENCY_PLANNER_VERSION])
  })

  // 10/2 실측: 첫 연락을 기다리기로 한 뒤 같은 첫 연락 기회가 매번 다시 나와 '중복'으로 막히고, 다른 이유가 영영 생기지 않았다.
  it('counts the first-contact chance as used once the character has decided on it', async () => {
    const { id } = await fixture()
    await db.update(roleplaySessions).set({ pendingRealityIntent: null, turnCount: 3 }).where(eq(roleplaySessions.id, id))
    const { calls } = provider({ action: 'wait' })
    const first = new Date(BEFORE.getTime() + 14 * 3_600_000) // 성격별 첫 연락 지연(최대 13시간)을 넘긴 때
    expect(await evaluateSession(id, first)).toEqual({ outcome: 'no_intent' })
    const decisions = await db.select().from(characterDecisions).where(eq(characterDecisions.sessionId, id))
    expect(decisions.map(d => d.triggerKey)).toEqual([expect.stringMatching(/^reality:opportunity:.+:first_contact$/)])
    expect(await evaluateSession(id, new Date(first.getTime() + 24 * 3_600_000))).not.toEqual({ outcome: 'skipped', reason: 'duplicate' })
    expect(calls.filter(c => c.version === AGENCY_PLANNER_VERSION)).toHaveLength(1)
  })

  it('wait beats a legacy pending intent and escalated event without sending or inventing progress', async () => {
    const { id } = await fixture()
    await db.insert(events).values({ sessionId: id, type: 'crisis', status: 'escalated', createdAtTurn: 0, continuationState: { summary: 'UNOBSERVED_EVENT' } })
    const { calls } = provider({ action: 'wait' })
    expect(await evaluateSession(id, NOW)).toEqual({ outcome: 'no_intent' })
    const state = await stored(id)
    expect(state.contacts).toHaveLength(0)
    expect(state.messages).toHaveLength(0)
    expect(state.decisions).toHaveLength(1)
    expect(state.decisions[0]!.decision.action).toBe('wait')
    expect(state.runtime.state.sequence).toBe(1)
    expect(state.runtime.nextWakeAt).toBeNull()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.prompt).not.toContain('UNOBSERVED_EVENT')
    const [event] = await db.select().from(events).where(eq(events.sessionId, id))
    expect(event!.status).toBe('escalated')
    expect(await evaluateSession(id, new Date(NOW.getTime() + 3_600_000))).toEqual({ outcome: 'no_intent' })
    expect(calls).toHaveLength(1) // no fresh evidence or due goal: no periodic re-appraisal cost.
  })

  it('initializes a first runtime on the evaluation clock instead of a later wall-clock timestamp', async () => {
    const { id } = await fixture()
    await db.delete(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, id))
    provider({ action: 'wait' })
    const evaluatedAt = new Date(Date.now() - 10_000)
    await db.update(messages).set({ createdAt: evaluatedAt }).where(eq(messages.sessionId, id))
    await db.update(roleplaySessions).set({ lastInteractionAt: new Date(evaluatedAt.getTime() - 60_000) }).where(eq(roleplaySessions.id, id))
    expect(await evaluateSession(id, evaluatedAt)).toEqual({ outcome: 'no_intent' })
    const result = await stored(id)
    expect(result.decisions).toHaveLength(1)
    expect(result.runtime.state.sequence).toBe(1)
    expect(result.runtime.state.updatedAt).toBe(evaluatedAt.toISOString())
  })

  it('a real-time due goal can wake without new messages and a deferred goal is backed off', async () => {
    const { id, revisionId, messageId } = await fixture()
    const state = createAgencyState(revisionId, NOW.toISOString())
    state.sequence = 1
    state.goals = [{ id: 'goal:1:0', description: '연락할 때를 다시 검토한다.', evidenceIds: [messageId], ruleIds: ['personality'],
      priority: 1, status: 'active', createdAt: BEFORE.toISOString(), updatedAt: BEFORE.toISOString(),
      success: 'sent', clock: 'real_time', dueAt: new Date(NOW.getTime() + 60_000).toISOString(),
    }]
    await db.update(characterRuntimeStates).set({ state }).where(eq(characterRuntimeStates.sessionId, id))
    const { calls } = provider({ action: 'wait' })
    const later = new Date(NOW.getTime() + 3_600_000)
    expect(await evaluateSession(id, later)).toEqual({ outcome: 'no_intent' })
    expect(calls).toHaveLength(1)
    expect((await stored(id)).runtime.nextWakeAt!.getTime()).toBeGreaterThanOrEqual(later.getTime() + POLICY.reality.recheckMinutes * 60_000)
  })

  it('a live cohort never falls back to legacy when a pre-existing runtime is still shadow, and drops the legacy intent', async () => {
    const { id } = await fixture()
    await db.update(characterRuntimeStates).set({ mode: 'shadow' }).where(eq(characterRuntimeStates.sessionId, id))
    const { calls } = provider()
    expect(await evaluateSession(id, NOW)).toEqual({ outcome: 'skipped', reason: 'agency_unavailable' })
    expect((await stored(id)).contacts).toHaveLength(0)
    expect(calls).toHaveLength(0)
    const [session] = await db.select({ pending: roleplaySessions.pendingRealityIntent }).from(roleplaySessions).where(eq(roleplaySessions.id, id))
    expect(session!.pending).toBeNull()
  })

  it('persists actual message, contact, sent receipt and decision together; legacy motivation cannot veto it', async () => {
    const { id, userId } = await fixture() // stranger profile would fail legacy motivation.
    const { llm } = provider()
    expect(await evaluateSession(id, NOW)).toMatchObject({ outcome: 'sent', channel: 'message' })
    const state = await stored(id)
    expect(state.contacts).toHaveLength(1)
    expect(state.messages).toHaveLength(1)
    expect(state.decisions).toHaveLength(1)
    expect(state.contacts[0]!.messageId).toBe(state.messages[0]!.id)
    expect(state.runtime.state.actions).toEqual([expect.objectContaining({ type: 'contact', status: 'sent', outcomeEvidenceId: `${state.messages[0]!.id}:sent` })])
    expect(state.runtime.version).toBe(1)
    // 같은 기회(남은 의도)는 이미 소비됐고 새 근거도 없다 — 두 번 보내지 않는다.
    expect((await evaluateSession(id, NOW)).outcome).not.toBe('sent')
    expect((await stored(id)).contacts).toHaveLength(1)
    const loaded = await loadSession(id, userId)
    const runtime = await loadAgencyRuntime(id, userId, loaded!.snapshot, llm)
    const evidence = await loadAgencyEvidence(id, loaded!.snapshot, runtime!, undefined, NOW)
    expect(evidence).toContainEqual(expect.objectContaining({ id: `${state.messages[0]!.id}:sent`, kind: 'outcome', epistemic: 'observed', outcomeStatus: 'sent' }))
    // The earlier proactive message stays visible as what the character actually said.
    expect(evidence).toContainEqual(expect.objectContaining({ id: state.messages[0]!.id, kind: 'message', quote: state.messages[0]!.content }))
  })

  it('renders only pinned authored fields and participant evidence, excluding legacy secret memory/narration', async () => {
    const { id, characterId, snapshot } = await fixture()
    await db.insert(messages).values({ sessionId: id, role: 'narrator', kind: 'text', content: 'SECRET_NARRATOR', turnIndex: 0, createdAt: NOW })
    await db.insert(memories).values({ sessionId: id, characterId, type: 'fact', content: 'UNSOURCED_SECRET_MEMORY', importance: 100, persistence: 100, confidence: 100 })
    await db.update(characters).set({ name: 'NEW_UNPINNED_NAME', personality: 'NEW_UNPINNED_PERSONALITY' }).where(eq(characters.id, characterId))
    const { calls } = provider()
    expect((await evaluateSession(id, NOW)).outcome).toBe('sent')
    const rendered = calls.find(call => call.version === REALITY_CONTENT_VERSION)!
    expect(rendered.prompt).toContain(snapshot.character.identity.name)
    expect(rendered.prompt).not.toMatch(/SECRET_NARRATOR|UNSOURCED_SECRET_MEMORY|NEW_UNPINNED_/)
    expect(rendered.system).toContain('GROUNDED_RUNTIME_DATA')
  })

  it('repairs an unsupported contact once and persists only the verified message', async () => {
    const { id } = await fixture()
    const { calls } = provider({ rejectFirst: true })
    expect(await evaluateSession(id, NOW)).toMatchObject({ outcome: 'sent' })
    const renders = calls.filter(call => call.version === REALITY_CONTENT_VERSION)
    expect(renders).toHaveLength(2)
    expect(renders[1]!.system).toContain('unsupported_success')
    expect(calls.filter(call => call.version === AGENCY_PLANNER_VERSION)).toHaveLength(1)
    const state = await stored(id)
    expect(state.contacts).toHaveLength(1)
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]!.content).toBe('잠깐 이야기할 수 있을까요?')
    expect(state.decisions).toHaveLength(1)
  })

  it('does not deliver a repaired contact if the session advanced during generation', async () => {
    const { id } = await fixture()
    let renders = 0
    provider({ rejectFirst: true, duringRender: async () => {
      if (++renders === 2) await db.update(roleplaySessions).set({ turnCount: 1 }).where(eq(roleplaySessions.id, id))
    } })
    expect(await evaluateSession(id, NOW)).toEqual({ outcome: 'skipped', reason: 'state_changed' })
    expect((await stored(id)).contacts).toHaveLength(0)
  })

  it('rejected realization persists no reply, receipt, decision or runtime proposal', async () => {
    const { id } = await fixture()
    const { calls } = provider({ reject: true })
    expect(await evaluateSession(id, NOW)).toEqual({ outcome: 'skipped', reason: 'agency_rejected' })
    const state = await stored(id)
    expect(state.contacts).toHaveLength(0)
    expect(state.messages).toHaveLength(0)
    expect(state.decisions).toHaveLength(0)
    expect(state.runtime.version).toBe(0)
    expect(state.runtime.state.sequence).toBe(0)
    expect(calls.filter(call => call.version === REALITY_CONTENT_VERSION)).toHaveLength(2)
  })

  it('rolls back already-inserted message/contact if the receipt transition fails', async () => {
    const { id } = await fixture()
    provider()
    vi.spyOn(receipts, 'applyMessageReceipt').mockImplementation(() => { throw new Error('injected_receipt_failure') })
    expect(await evaluateSession(id, NOW)).toEqual({ outcome: 'skipped', reason: 'agency_unavailable' })
    const state = await stored(id)
    expect(state.contacts).toHaveLength(0)
    expect(state.messages).toHaveLength(0)
    expect(state.decisions).toHaveLength(0)
    expect(state.runtime.version).toBe(0)
    expect(push.deliverRealityPush).not.toHaveBeenCalled()
  })

  // 앱 밖 연락은 끌 수 없다 (2026-09-24) — 예전에 저장된 알림 끄기·야간 차단 값은 읽지 않는다.
  it('always enqueues the out-of-app push, whatever old settings say', async () => {
    const { id, userId } = await fixture()
    await db.update(userSettings).set({ pushEnabled: false, quietHoursEnabled: true, quietHoursStart: '00:00', quietHoursEnd: '23:59' })
      .where(eq(userSettings.userId, userId))
    const enqueue = vi.spyOn(push, 'enqueueRealityPush')
    provider()
    expect((await evaluateSession(id, NOW)).outcome).toBe('sent')
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect((await stored(id)).contacts).toHaveLength(1)
  })

  it.each(['contact_disabled', 'session_advanced'] as const)('rejects an inferred reply if %s changed before the transaction', async kind => {
    const { id, characterId } = await fixture()
    provider({ duringRender: async () => {
      if (kind === 'contact_disabled') await db.update(contactProfiles).set({ enabled: false }).where(eq(contactProfiles.characterId, characterId))
      else await db.update(roleplaySessions).set({ turnCount: 1 }).where(eq(roleplaySessions.id, id))
    } })
    expect(await evaluateSession(id, NOW)).toEqual({ outcome: 'skipped', reason: 'state_changed' })
    const state = await stored(id)
    expect(state.contacts).toHaveLength(0)
    expect(state.messages).toHaveLength(0)
    expect(state.decisions).toHaveLength(0)
    expect(state.runtime.version).toBe(0)
  })

  it('concurrent ticks commit at most one delivery and one runtime sequence', async () => {
    const { id } = await fixture()
    provider()
    const outcomes = await Promise.all([evaluateSession(id, NOW), evaluateSession(id, NOW)])
    expect(outcomes.filter(value => value.outcome === 'sent')).toHaveLength(1)
    const state = await stored(id)
    expect(state.contacts).toHaveLength(1)
    expect(state.messages).toHaveLength(1)
    expect(state.decisions).toHaveLength(1)
    expect(state.runtime.version).toBe(1)
  })

  // §5: 생활 리듬은 legacy 와 같은 전달 제약이다 — 바쁜 캐릭터는 결정이 contact 여도 보내지 않는다.
  it('a busy routine blocks dispatch the same way it does on the legacy path', async () => {
    const { id, characterId } = await fixture()
    await db.update(contactProfiles).set({ routine: { version: 1, source: 'authored', note: null, generatedAt: NOW.toISOString(),
      blocks: [{ days: [], start: '00:00', end: '23:59', label: '회의', availability: 'busy' }] } }).where(eq(contactProfiles.characterId, characterId))
    const { calls } = provider()
    // 쿨다운과 같은 꼴: 연락 권한이 빠진 채 계획되고, contact 후보는 선택되지 못한다.
    expect(await evaluateSession(id, NOW)).toEqual({ outcome: 'no_intent' })
    expect(JSON.parse(calls[0]!.prompt).permissions.contact).toBe(false)
    expect(JSON.parse(JSON.parse(calls[0]!.prompt).input).deliveryBlocked).toBe('busy')
    expect((await stored(id)).messages).toHaveLength(0)
  })

  it('leaves a ledger row for the queued contact and the appraisal, under the same policy version as chat', async () => {
    const { id, messageId } = await fixture()
    provider({ relationship: true })
    const result = await evaluateSession(id, NOW)
    expect(result.outcome).toBe('sent')
    const rows = await db.select().from(stateTransitions).where(eq(stateTransitions.sessionId, id))
    expect(rows.every(r => r.policyVersion === 'turn-policy:v1' && r.engine === 'agency' && r.decisionId)).toBe(true)
    expect(rows.find(r => r.rule === 'contact_dispatched')).toMatchObject({ field: 'contact.message', after: 'queued', status: 'applied', clock: 'real',
      outcomeRef: result.outcome === 'sent' ? result.contactId : null })
    expect(rows.find(r => r.field === 'relationship.trust')).toMatchObject({ rule: 'relationship_appraisal', before: expect.any(Number), after: expect.any(Number) })
    expect(rows.some(r => JSON.stringify([r.before, r.after]).includes('이야기할 수 있어요'))).toBe(false)
    expect(messageId).toBeTruthy()
  })

  it('only fresh user evidence changes relationship, and later ticks do not replay it', async () => {
    const { id } = await fixture()
    const [before] = await db.select().from(relationships).where(eq(relationships.sessionId, id))
    provider({ action: 'wait', relationship: true })
    await evaluateSession(id, NOW)
    await evaluateSession(id, new Date(NOW.getTime() + 3_600_000))
    const [after] = await db.select().from(relationships).where(eq(relationships.sessionId, id))
    expect(after!.trust).toBe(before!.trust + 2)
    expect(after!.version).toBe(before!.version + 1)
  })

  it('completes sent goals with the persisted message but never fabricates delivered/answered outcomes', async () => {
    const { id, revisionId, messageId } = await fixture()
    const state = createAgencyState(revisionId, BEFORE.toISOString())
    state.goals = (['sent', 'delivered', 'answered'] as const).map((success, index) => ({ id: `goal:1:${index}`, description: `goal ${success}`,
      evidenceIds: [messageId], ruleIds: ['personality'], priority: 1, status: 'active', createdAt: BEFORE.toISOString(), updatedAt: BEFORE.toISOString(), success,
    }))
    await db.update(characterRuntimeStates).set({ state }).where(eq(characterRuntimeStates.sessionId, id))
    provider({ goalIds: state.goals.map(goal => goal.id) })
    expect((await evaluateSession(id, NOW)).outcome).toBe('sent')
    const next = (await stored(id)).runtime.state
    expect(next.goals.map(goal => goal.status)).toEqual(['completed', 'active', 'active'])
    expect(next.actions[0]!.status).toBe('sent')
  })

  it('the scheduler wakes a due goal only for sessions still listed in a live cohort', async () => {
    const { id } = await fixture()
    await db.update(characterRuntimeStates).set({ nextWakeAt: BEFORE }).where(eq(characterRuntimeStates.sessionId, id))
    const due = async () => (await db.execute(sql`SELECT s2.id FROM roleplay_sessions s2 WHERE s2.id = ${id} AND ${agencyDueCondition(NOW)}`)).length
    expect(await due()).toBe(1)
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', id)
    expect(await due()).toBe(1)
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', randomUUID())
    expect(await due()).toBe(0)
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', '')
    expect(await due()).toBe(0)
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'off')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', id)
    expect(await due()).toBe(0)
    // §6: 정책 버전이 agency:v1 인 세션은 목록에 없어도 깨어난다 — 중단 스위치가 꺼져 있을 때만.
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'live')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', '')
    await db.update(roleplaySessions).set({ policyVersion: 'agency:v1' }).where(eq(roleplaySessions.id, id))
    expect(await due()).toBe(1)
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'off')
    expect(await due()).toBe(0)
  })

  it('shadow and off paths cannot persist agency decisions, runtime changes or contact output', async () => {
    const { id } = await fixture()
    const [row] = await db.select({ session: roleplaySessions, character: characters, profile: contactProfiles, settings: userSettings })
      .from(roleplaySessions).innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
      .innerJoin(contactProfiles, eq(contactProfiles.characterId, characters.id))
      .leftJoin(userSettings, eq(userSettings.userId, roleplaySessions.userId)).where(eq(roleplaySessions.id, id))
    const before = await stored(id)
    const { calls } = provider()
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'shadow')
    expect(await evaluateAgencyReality(row!, NOW, {})).toBeNull()
    expect(await stored(id)).toEqual(before)
    expect(calls).toHaveLength(1)
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'off')
    expect(await evaluateAgencyReality(row!, NOW, {})).toBeNull()
    expect(calls).toHaveLength(1)
    expect(await stored(id)).toEqual(before)
  })
  // 한 사람(2026-10-02): 기존 경로가 찾던 연락 기회(첫 연락·조용함·식사·헤어진 뒤·답장 대기)는 엔진의 판단 재료가 된다 — 보낼지는 캐릭터가 정한다.
  /** 새 근거가 없는 상태로 — 기회만이 계획을 깨울 수 있게(대화 직후의 첫 판단과 구별). */
  async function settled(id: string, revisionId: string, at: Date) {
    const state = createAgencyState(revisionId, at.toISOString())
    state.sequence = 1
    await db.update(characterRuntimeStates).set({ state }).where(eq(characterRuntimeStates.sessionId, id))
  }

  it('weighs the first-contact chance in character and sends it once, under the legacy key', async () => {
    const { id, revisionId } = await fixture()
    await db.update(roleplaySessions).set({ pendingRealityIntent: null, turnCount: 4 }).where(eq(roleplaySessions.id, id))
    await settled(id, revisionId, new Date(NOW.getTime() + 60_000))
    const { calls } = provider()
    const later = new Date(NOW.getTime() + 10 * 3_600_000)   // 토마스의 첫 연락 시각(약 8.8시간)이 지났다
    expect(await evaluateSession(id, later)).toMatchObject({ outcome: 'sent' })
    const planned = calls.filter(call => call.version === AGENCY_PLANNER_VERSION)
    expect(planned).toHaveLength(1)
    expect(JSON.parse(JSON.parse(planned[0]!.prompt).input).contactOpportunity.reason).toMatch(/처음 만난 뒤 첫 연락/)
    expect((await stored(id)).contacts.map(c => c.dedupeKey)).toEqual(['message:first_contact'])
    // 첫 연락은 한 번 — 다음 확인에는 기회도 새 근거도 없어 계획을 부르지 않는다.
    expect(await evaluateSession(id, new Date(later.getTime() + 2 * 3_600_000))).toEqual({ outcome: 'no_intent' })
    expect(calls.filter(call => call.version === AGENCY_PLANNER_VERSION)).toHaveLength(1)
  })

  // 2026-10-16 사용자: 하루 몇 통·간격·안 읽은 수 같은 숫자 상한은 없다 — 오늘 이미 여러 번 연락했어도 보낼지는 캐릭터가 정한다.
  it('no daily cap: after many contacts today the planner still decides and can send', async () => {
    const { id, revisionId } = await fixture()
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: '잘 들어갔는지 묻는다', urgency: 0.5, rule: 'after_scene' } }).where(eq(roleplaySessions.id, id))
    await db.insert(realityContacts).values([8, 9, 10, 11, 12].map(h => ({ sessionId: id, channel: 'message' as const, reason: 'earlier',
      dedupeKey: randomUUID(), status: 'opened' as const, sentAt: new Date(Date.parse('2026-09-24T00:00:00+09:00') + h * 3_600_000) })))   // 오늘 08~12시 KST
    await settled(id, revisionId, new Date(NOW.getTime() + 60_000))
    const { calls } = provider()
    expect(await evaluateSession(id, new Date(NOW.getTime() + 2 * 60_000))).toMatchObject({ outcome: 'sent' })
    expect(calls.filter(call => call.version === AGENCY_PLANNER_VERSION)).toHaveLength(1)
  })

  it("keeps the user's text but ends the pending reply when the character chooses to leave it unanswered", async () => {
    const { id, revisionId } = await fixture()
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: '문자에 답장한다', urgency: 0.9, answers: 'user_message',
      notBefore: new Date(NOW.getTime() - 60_000).toISOString() } }).where(eq(roleplaySessions.id, id))
    await settled(id, revisionId, new Date(NOW.getTime() + 60_000))
    const { calls } = provider({ action: 'wait' })
    const at = new Date(NOW.getTime() + 2 * 60_000)
    expect(await evaluateSession(id, at)).toEqual({ outcome: 'no_intent' })
    expect(JSON.parse(JSON.parse(calls[0]!.prompt).input).contactOpportunity).toMatchObject({ answers: 'user_message' })
    const [session] = await db.select({ pending: roleplaySessions.pendingRealityIntent }).from(roleplaySessions).where(eq(roleplaySessions.id, id))
    expect(session!.pending).toBeNull()
    expect((await db.select().from(messages).where(eq(messages.sessionId, id))).some(m => m.role === 'user')).toBe(true)
  })

  it('holds new autonomy while the revision is not ready, but never drops a reply to the user', async () => {
    const { id } = await fixture()
    await db.update(characterRuntimeStates).set({ mode: 'shadow' }).where(eq(characterRuntimeStates.sessionId, id))
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: '문자에 답장한다', urgency: 0.9, answers: 'user_message',
      notBefore: new Date(NOW.getTime() - 60_000).toISOString() } }).where(eq(roleplaySessions.id, id))
    const { calls } = provider()
    expect(await evaluateSession(id, NOW)).toEqual({ outcome: 'skipped', reason: 'agency_unavailable' })
    expect(calls).toHaveLength(0)
    const [session] = await db.select({ pending: roleplaySessions.pendingRealityIntent }).from(roleplaySessions).where(eq(roleplaySessions.id, id))
    expect(session!.pending).toMatchObject({ answers: 'user_message' })
  })
  it('accepts consecutive texts during an active scene request, replays once, and keeps them unknown until read', async () => {
    const f = await fixture()
    const model = provider({ action: 'wait' })
    await db.insert(conversationRequests).values({ id: randomUUID(), userId: f.userId, sessionId: f.id, inputHash: 'scene-in-progress', leaseUntil: new Date(NOW.getTime() + 60_000) })
    const first = { userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '우산은 공방에 두고 갈게요.' }
    const [a, replay] = await Promise.all([receiveMessenger(first, NOW), receiveMessenger(first, NOW)])
    expect(a.id).toBe(replay.id)
    const b = await receiveMessenger({ ...first, requestId: randomUUID(), input: '내일 가져가도 돼요?' }, NOW)
    expect(a.readAt).toBeNull()
    expect(b.readAt).toBeNull()
    expect((await messengerItems(f.userId, f.id))!.filter(item => item.kind === 'messenger')).toHaveLength(2)
    expect(await messengerItems(randomUUID(), f.id)).toBeNull()
    const loaded = await loadSession(f.id, f.userId)
    expect(loaded!.snapshot.recentMessages.some(item => item.id === a.id || item.id === b.id)).toBe(false)
    expect(model.calls).toHaveLength(0)
    await expect(receiveMessenger({ ...first, input: '다른 내용' }, NOW)).rejects.toThrow('conflict')
  })

  it('preserves sender order when network requests arrive out of order without trusting arbitrary old timestamps', async () => {
    const f = await fixture()
    const common = { userId: f.userId, sessionId: f.id }
    await receiveMessenger({ ...common, requestId: randomUUID(), input: '두 번째 문자', sentAt: new Date(NOW.getTime() - 1000).toISOString() }, NOW)
    await receiveMessenger({ ...common, requestId: randomUUID(), input: '첫 번째 문자', sentAt: new Date(NOW.getTime() - 2000).toISOString() }, NOW)
    const stale = await receiveMessenger({ ...common, requestId: randomUUID(), input: '세 번째 문자', sentAt: '2000-01-01T00:00:00.000Z' }, NOW)
    expect(stale.at).toBe(NOW.toISOString())
    expect((await messengerItems(f.userId, f.id))!.filter(item => item.kind === 'messenger').map(item => item.content)).toEqual(['첫 번째 문자', '두 번째 문자', '세 번째 문자'])
  })

  it('preserves selected DM models across replay, reading and delayed batched replies', async () => {
    vi.stubEnv('MIRO_MODEL_REGISTRY', JSON.stringify([{ id: 'dm-choice', provider: 'mock', providerModelId: 'dm-choice',
      tier: 'standard', capabilities: ['dialogue'], maxContextTokens: 32768, maxOutputTokens: 8192, inputCost: 0.1, outputCost: 0.2 }]))
    vi.stubEnv('MIRO_CHAT_MODEL_ID', '')
    const f = await fixture()
    const model = provider({ action: 'contact' })
    const first = { userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '지금 이야기해도 될까요?', chatModel: 'model:dm-choice:scene' }
    const a = await receiveMessenger(first, NOW)
    expect((await receiveMessenger(first, NOW)).id).toBe(a.id)
    await expect(receiveMessenger({ ...first, chatModel: 'model:dm-choice:long' }, NOW)).rejects.toThrow('conflict')
    await expect(receiveMessenger({ ...first, requestId: randomUUID(), chatModel: 'forged-model' }, NOW)).rejects.toThrow('invalid_model')
    const b = await receiveMessenger({ ...first, requestId: randomUUID(), input: '조금 더 자세히 듣고 싶어요.', chatModel: 'model:dm-choice:long' }, new Date(NOW.getTime() + 1))
    expect(model.calls).toHaveLength(0)
    expect((await messengerItems(f.userId, f.id))!.filter(item => item.kind === 'messenger').map(item => item.chatModel))
      .toEqual(['model:dm-choice:scene', 'model:dm-choice:long'])
    const [profile] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, f.characterId))
    const readTime = new Date(NOW.getTime() + 1000)
    await runMessengerInbox(readTime, { sessionId: f.id })
    await runMessengerInbox(new Date(readTime.getTime() + replyPauseMs(profile!.replyDelayMinutes) + 1000), { sessionId: f.id })
    expect(vi.mocked(providers.createAI).mock.calls.some(([opts]) => opts.context?.dialogueModelId === 'dm-choice')).toBe(true)
    expect(model.calls.find(call => call.version === REALITY_CONTENT_VERSION)?.system).toContain('ECHO(긴 대화)')
    const inbox = await db.select().from(messengerInbox).where(inArray(messengerInbox.messageId, [a.id, b.id]))
    expect(inbox.every(item => item.status === 'replied')).toBe(true)
    expect(inbox.map(item => item.chatModel).sort()).toEqual(['model:dm-choice:long', 'model:dm-choice:scene'])
  })

  it('stays unread while asleep, then reads without replying and can leave the message unanswered', async () => {
    const f = await fixture()
    const model = provider({ action: 'wait', closeReply: true })
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '밥 먹었어요.' }, NOW)
    const [profile] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, f.characterId))
    const readTime = new Date(NOW.getTime() + 1000)
    await db.update(contactProfiles).set({ routine: { version: 1, source: 'authored', generatedAt: NOW.toISOString(), blocks: [{ days: [], start: '00:00', end: '23:59', label: '수면', availability: 'unreachable' }] } }).where(eq(contactProfiles.characterId, f.characterId))
    await runMessengerInbox(readTime, { sessionId: f.id })
    expect((await messengerItems(f.userId, f.id))!.find(item => item.id === message.id)?.readAt).toBeNull()
    expect(model.calls).toHaveLength(0)
    await db.update(contactProfiles).set({ routine: { version: 1, source: 'authored', generatedAt: NOW.toISOString(), blocks: [{ days: [], start: '00:00', end: '23:59', label: '자유 시간', availability: 'free' }] } }).where(eq(contactProfiles.characterId, f.characterId))
    await db.update(messengerInbox).set({ nextReviewAt: readTime }).where(eq(messengerInbox.messageId, message.id))
    await runMessengerInbox(readTime, { sessionId: f.id })
    expect((await messengerItems(f.userId, f.id))!.find(item => item.id === message.id)?.readAt).toBe(readTime.toISOString())
    expect(model.calls.filter(call => call.version === ATTENTION_VERSION)).toHaveLength(1)
    const replyTime = new Date(readTime.getTime() + replyPauseMs(profile!.replyDelayMinutes) + 1000)
    await runMessengerInbox(replyTime, { sessionId: f.id })
    const [inbox] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(inbox).toMatchObject({ status: 'left', contactId: null, leaseToken: null })
    const calls = model.calls.length
    await runMessengerInbox(new Date(replyTime.getTime() + 600_000), { sessionId: f.id })
    expect(model.calls).toHaveLength(calls)
    expect((await loadSession(f.id, f.userId))!.snapshot.recentMessages.some(item => item.id === message.id)).toBe(true)
  })

  it('keeps a read question retryable when delivery is busy, then replies when free', async () => {
    const f = await fixture()
    const model = provider({ action: 'contact' })
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '먼저 연락 줘서 고마워요. 어제 연습은 어땠어요?' }, NOW)
    const [profile] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, f.characterId))
    const readTime = new Date(NOW.getTime() + 1000)
    await runMessengerInbox(readTime, { sessionId: f.id })
    const routine = (availability: 'busy' | 'free') => ({ version: 1 as const, source: 'authored' as const, generatedAt: NOW.toISOString(),
      blocks: [{ days: [], start: '00:00', end: '23:59', label: '일과', availability }] })
    await db.update(contactProfiles).set({ routine: routine('busy') }).where(eq(contactProfiles.characterId, f.characterId))
    const replyTime = new Date(readTime.getTime() + replyPauseMs(profile!.replyDelayMinutes) + 1000)
    await runMessengerInbox(replyTime, { sessionId: f.id })
    const [waiting] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(waiting).toMatchObject({ status: 'read', contactId: null, decidedAt: null, leaseToken: null })
    expect(model.calls.filter(call => call.version === AGENCY_PLANNER_VERSION)).toHaveLength(0)
    await db.update(contactProfiles).set({ routine: routine('free') }).where(eq(contactProfiles.characterId, f.characterId))
    await runMessengerInbox(new Date(replyTime.getTime() + 120_000), { sessionId: f.id })
    const [answered] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(answered!.status).toBe('replied')
    expect(answered!.contactId).not.toBeNull()
    expect(model.calls.filter(call => call.version === AGENCY_PLANNER_VERSION)).toHaveLength(1)
  })

  it('ends the read question when the character itself chooses silence (읽씹)', async () => {
    const f = await fixture()
    const model = provider({ action: 'wait' })
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '연습은 음악부터 익혀요, 숫자로 세요?' }, NOW)
    const [profile] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, f.characterId))
    const readTime = new Date(NOW.getTime() + 1000)
    await runMessengerInbox(readTime, { sessionId: f.id })
    const replyTime = new Date(readTime.getTime() + replyPauseMs(profile!.replyDelayMinutes) + 1000)
    await runMessengerInbox(replyTime, { sessionId: f.id })
    const [left] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(left).toMatchObject({ status: 'left', contactId: null, leaseToken: null })
    expect(left!.attentionDecision).toMatchObject({ replyDisposition: { disposition: 'close', reason: 'character_choice' } })
    expect(model.calls.filter(call => call.version === REPLY_DISPOSITION_VERSION)).toHaveLength(0)
    const calls = model.calls.length
    await runMessengerInbox(new Date(replyTime.getTime() + 3 * 3_600_000), { sessionId: f.id })
    expect(model.calls).toHaveLength(calls)
  })

  it('keeps the fallback wait pending when no grounded action can execute, and prioritizes its read question over a new unread envelope', async () => {
    const f = await fixture()
    provider({ action: 'respond' })
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '연습은 음악부터 익혀요, 숫자로 세요?' }, NOW)
    const [profile] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, f.characterId))
    const readTime = new Date(NOW.getTime() + 1000)
    await runMessengerInbox(readTime, { sessionId: f.id })
    const replyTime = new Date(readTime.getTime() + replyPauseMs(profile!.replyDelayMinutes) + 1000)
    await runMessengerInbox(replyTime, { sessionId: f.id })
    const [waiting] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(waiting).toMatchObject({ status: 'read', decidedAt: null, contactId: null, leaseToken: null })
    const later = new Date(waiting!.nextReviewAt.getTime() + 1000)
    const unread = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '그 부분이 궁금했어요.' }, new Date(later.getTime() - 1000))
    const model = provider({ action: 'contact', attention: 'leave_unread' })
    await runMessengerInbox(later, { sessionId: f.id })
    const [answered] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    const [stillUnread] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, unread.id))
    expect(answered!.status).toBe('replied')
    expect(stillUnread!.status).toBe('unread')
    expect(model.calls.filter(call => call.version === ATTENTION_VERSION)).toHaveLength(0)
  })

  it('retains the read question after disposition-provider failure and later sends exactly one answer', async () => {
    const f = await fixture()
    provider({ action: 'respond', failDisposition: true })
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '아까 연습 얘기를 이어서 해 줄래요?' }, NOW)
    const [profile] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, f.characterId))
    const readTime = new Date(NOW.getTime() + 1000)
    await runMessengerInbox(readTime, { sessionId: f.id })
    const replyTime = new Date(readTime.getTime() + replyPauseMs(profile!.replyDelayMinutes) + 1000)
    await runMessengerInbox(replyTime, { sessionId: f.id })
    const [failed] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(failed).toMatchObject({ status: 'read', decidedAt: null, contactId: null, leaseToken: null })
    provider({ action: 'contact' })
    await runMessengerInbox(new Date(failed!.nextReviewAt.getTime() + 1000), { sessionId: f.id })
    const [answered] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(answered!.status).toBe('replied')
    expect((await stored(f.id)).contacts).toHaveLength(1)
  })

  it('reviews an explicit deferral again instead of treating it as permanent silence', async () => {
    const f = await fixture()
    provider({ action: 'defer' })
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '약속한 연습 얘기 지금 들어도 돼요?' }, NOW)
    const [profile] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, f.characterId))
    const readTime = new Date(NOW.getTime() + 1000)
    await runMessengerInbox(readTime, { sessionId: f.id })
    const replyTime = new Date(readTime.getTime() + replyPauseMs(profile!.replyDelayMinutes) + 1000)
    await runMessengerInbox(replyTime, { sessionId: f.id })
    const [waiting] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(waiting).toMatchObject({ status: 'read', decidedAt: null, contactId: null })
    expect(waiting!.nextReviewAt.getTime()).toBe(replyTime.getTime() + 15 * 60_000)
    const later = provider({ action: 'contact' })
    await runMessengerInbox(new Date(waiting!.nextReviewAt.getTime() + 1000), { sessionId: f.id })
    const [answered] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(answered!.status).toBe('replied')
    expect(later.calls.filter(call => call.version === AGENCY_PLANNER_VERSION)).toHaveLength(1)
  })

  it('settles a delayed reply and its inbox receipt atomically without overwriting another promise', async () => {
    const f = await fixture()
    const model = provider({ action: 'contact' })
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '어제 약속한 얘기를 이어갈까요?' }, NOW)
    const [profile] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, f.characterId))
    const readTime = new Date(NOW.getTime() + 1000)
    await runMessengerInbox(readTime, { sessionId: f.id })
    const replyTime = new Date(readTime.getTime() + replyPauseMs(profile!.replyDelayMinutes) + 1000)
    await Promise.all([runMessengerInbox(replyTime, { sessionId: f.id }), runMessengerInbox(replyTime, { sessionId: f.id })])
    const [inbox] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(inbox!.status).toBe('replied')
    expect(inbox!.contactId).not.toBeNull()
    const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, f.id))
    expect(session!.pendingRealityIntent).toMatchObject({ reason: 'legacy should not choose this action' })
    const contacts = await db.select().from(realityContacts).where(eq(realityContacts.sessionId, f.id))
    expect(contacts).toHaveLength(1)
    const calls = model.calls.filter(call => call.version === AGENCY_PLANNER_VERSION)
    expect(calls).toHaveLength(1)
    expect(JSON.parse(JSON.parse(calls[0]!.prompt).input).trigger).toBe('incoming_messenger_read')
  })

  it('can read on the first review, sees personality/relationship/affect, and cannot inspect the unread body', async () => {
    const f = await fixture()
    const { calls } = provider({ attention: 'read' })
    const [runtime] = await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, f.id))
    await db.update(characterRuntimeStates).set({ state: { ...runtime!.state, affect: { ...runtime!.state.affect, valence: -30 } }, version: runtime!.version + 1 }).where(eq(characterRuntimeStates.sessionId, f.id))
    const secret = '아직읽지않은문자의비밀-잠금코드는8591'
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: secret }, NOW)
    await runMessengerInbox(NOW, { sessionId: f.id })
    expect((await messengerItems(f.userId, f.id))!.find(item => item.id === message.id)?.readAt).toBe(NOW.toISOString())
    const attention = calls.filter(call => call.version === ATTENTION_VERSION)
    expect(attention).toHaveLength(1)
    expect(attention[0]!.prompt).not.toContain(secret)
    const input = JSON.parse(attention[0]!.prompt)
    expect(input.rules.some((rule: { id: string }) => rule.id === 'personality')).toBe(true)
    expect(input.relationship).toHaveProperty('trust')
    expect(input.affect.valence).toBe(-30)
    expect(calls.some(call => call.version === AGENCY_PLANNER_VERSION)).toBe(false)
  })

  it('defers opening and a due review can defer again without reading or creating memory work', async () => {
    const f = await fixture()
    const { calls } = provider({ attention: 'defer' })
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '지금 열어보지 않아도 돼요.' }, NOW)
    await runMessengerInbox(NOW, { sessionId: f.id })
    let [inbox] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(inbox).toMatchObject({ status: 'unread', readAt: null, attentionState: 'deferred' })
    expect(inbox!.nextReviewAt.getTime()).toBe(NOW.getTime() + 10 * 60_000)
    await runMessengerInbox(new Date(NOW.getTime() + 5 * 60_000), { sessionId: f.id })
    expect(calls.filter(call => call.version === ATTENTION_VERSION)).toHaveLength(1)
    await runMessengerInbox(new Date(NOW.getTime() + 10 * 60_000), { sessionId: f.id })
    ;[inbox] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(inbox!.readAt).toBeNull()
    expect(inbox!.attentionDecision).toMatchObject({ action: 'defer' })
    expect((await loadSession(f.id, f.userId))!.snapshot.recentMessages.some(item => item.id === message.id)).toBe(false)
  })

  it('keeps the same-period attention decision cached, then reconsiders a changed relationship', async () => {
    const f = await fixture()
    const options: { attention: 'read' | 'defer' | 'leave_unread' } = { attention: 'leave_unread' }
    const { calls } = provider(options)
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '답이 없어도 기다릴게요.' }, NOW)
    await runMessengerInbox(NOW, { sessionId: f.id })
    options.attention = 'read'
    await runMessengerInbox(new Date(NOW.getTime() + 60 * 60_000), { sessionId: f.id })
    expect(calls.filter(call => call.version === ATTENTION_VERSION)).toHaveLength(1)
    expect((await messengerItems(f.userId, f.id))!.find(item => item.id === message.id)?.readAt).toBeNull()
    await db.update(relationships).set({ trust: 70, version: sql`${relationships.version} + 1` }).where(eq(relationships.sessionId, f.id))
    await runMessengerInbox(new Date(NOW.getTime() + 2 * 60 * 60_000), { sessionId: f.id })
    expect(calls.filter(call => call.version === ATTENTION_VERSION)).toHaveLength(2)
    expect((await messengerItems(f.userId, f.id))!.find(item => item.id === message.id)?.readAt).not.toBeNull()
  })

  it('reconsiders a held unread message in a new local period without forcing a read', async () => {
    const f = await fixture()
    const { calls } = provider({ attention: 'leave_unread' })
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '나중에 얘기해요.' }, NOW)
    await runMessengerInbox(NOW, { sessionId: f.id })
    await runMessengerInbox(new Date(NOW.getTime() + 60 * 60_000), { sessionId: f.id })
    expect(calls.filter(call => call.version === ATTENTION_VERSION)).toHaveLength(1)
    await runMessengerInbox(new Date(NOW.getTime() + 4 * 60 * 60_000), { sessionId: f.id })
    expect(calls.filter(call => call.version === ATTENTION_VERSION)).toHaveLength(2)
    const [held] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(held!.readAt).toBeNull()
  })

  it('discards a reading choice when a new message changes the conversation during planning', async () => {
    const f = await fixture()
    const { calls } = provider({ attention: 'read', duringAttention: async () => {
      await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '나중에 읽어도 돼요.' }, new Date(NOW.getTime() + 1000))
    } })
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '안녕.' }, NOW)
    await runMessengerInbox(NOW, { sessionId: f.id })
    expect((await messengerItems(f.userId, f.id))!.find(item => item.id === message.id)?.readAt).toBeNull()
    expect(calls.filter(call => call.version === ATTENTION_VERSION)).toHaveLength(1)
  })

  it('reconsiders a held unopened thread on a new envelope, with no time requirement', async () => {
    const f = await fixture()
    const options: { attention: 'read' | 'leave_unread' } = { attention: 'leave_unread' }
    const { calls } = provider(options)
    const common = { userId: f.userId, sessionId: f.id }
    await receiveMessenger({ ...common, requestId: randomUUID(), input: '첫 연락이에요.' }, NOW)
    await runMessengerInbox(NOW, { sessionId: f.id })
    options.attention = 'read'
    const later = new Date(NOW.getTime() + 1000)
    await receiveMessenger({ ...common, requestId: randomUUID(), input: '새 연락이에요.' }, later)
    await runMessengerInbox(later, { sessionId: f.id })
    const inbox = await db.select().from(messengerInbox).where(eq(messengerInbox.sessionId, f.id))
    expect(inbox).toHaveLength(2)
    expect(inbox.every(item => item.status === 'read' && item.readAt?.getTime() === later.getTime())).toBe(true)
    expect(calls.filter(call => call.version === ATTENTION_VERSION)).toHaveLength(2)
  })

  it('does not turn a failed attention decision into a read receipt', async () => {
    const f = await fixture()
    provider({ duringAttention: async () => { throw new Error('provider unavailable') } })
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '읽었는지 궁금해요.' }, NOW)
    await runMessengerInbox(NOW, { sessionId: f.id })
    const [inbox] = await db.select().from(messengerInbox).where(eq(messengerInbox.messageId, message.id))
    expect(inbox).toMatchObject({ status: 'unread', readAt: null, attentionDecision: null, leaseToken: null })
  })

  it('does not persist a read after autonomy was disabled during the decision', async () => {
    const f = await fixture()
    provider({ attention: 'read', duringAttention: async () => { vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'off') } })
    const message = await receiveMessenger({ userId: f.userId, sessionId: f.id, requestId: randomUUID(), input: '천천히 확인해요.' }, NOW)
    await runMessengerInbox(NOW, { sessionId: f.id })
    expect((await messengerItems(f.userId, f.id))!.find(item => item.id === message.id)?.readAt).toBeNull()
  })

  it('delivers an actual stored photo with a caption through the atomic contact path', async () => {
    const f = await fixture()
    provider()
    vi.spyOn(photoDelivery, 'prepareMessengerPhoto').mockResolvedValue({ id: randomUUID(), url: '/api/messenger-images/test-photo', choice: {
      sendPhoto: true, reason: '공방 풍경을 공유한다.', subject: 'environment', description: '사람 없는 공방의 풍경',
      sourceId: 'current_environment', ruleIds: ['personality'], evidenceIds: [],
    } })
    const outcome = await evaluateSession(f.id, NOW)
    expect(outcome).toMatchObject({ outcome: 'sent', channel: 'photo' })
    const [photo] = await db.select().from(messages).where(and(eq(messages.sessionId, f.id), eq(messages.kind, 'photo')))
    expect(photo!.content).toBe('/api/messenger-images/test-photo')
    expect(photo!.blocks[0]).toMatchObject({ channel: 'photo', caption: '잠깐 이야기할 수 있을까요?', photoDescription: '사람 없는 공방의 풍경' })
    const loaded = await loadSession(f.id, f.userId)
    expect(loaded!.snapshot.recentMessages.find(m => m.id === photo!.id)!.content).toContain('공방의 풍경')
    expect(loaded!.snapshot.recentMessages.find(m => m.id === photo!.id)!.content).not.toContain('/api/messenger-images/')
    expect((await stored(f.id)).contacts).toHaveLength(1)
  })

  it('keeps ordinary message delivery when photo generation fails', async () => {
    const f = await fixture()
    const { calls } = provider()
    vi.spyOn(photoDelivery, 'prepareMessengerPhoto').mockRejectedValue(new Error('image service unavailable'))
    expect(await evaluateSession(f.id, NOW)).toMatchObject({ outcome: 'sent', channel: 'message' })
    expect((await stored(f.id)).messages).toHaveLength(1)
    expect(calls.find(c => c.version === REALITY_CONTENT_VERSION)!.system).toContain('NO photo attached')
  })

  it('only issues private image access to the owning user and revokes it for restricted conversations', async () => {
    const f = await fixture(), id = randomUUID()
    await db.insert(generatedMedia).values({ id, sessionId: f.id, characterId: f.characterId, kind: 'photo',
      url: `/api/messenger-images/${id}`, cacheKey: 'fixture', providerMetadata: { storage: { bucket: 'messenger-images', path: `${f.id}/${id}.jpg` } } })
    const user = { id: f.userId, email: null, displayName: null, plan: 'free' as const, adultVerifiedAt: null }
    const current = vi.spyOn(auth, 'currentUser').mockResolvedValue({ ...user, id: randomUUID() })
    const signer = vi.fn().mockResolvedValue({ error: null, data: { signedUrl: 'https://fixture.supabase.co/signed-image' } })
    vi.spyOn(photoStorage, 'messengerStorage').mockReturnValue({ storage: { from: () => ({ createSignedUrl: signer }) } } as unknown as ReturnType<typeof photoStorage.messengerStorage>)
    const request = new Request(`http://localhost/api/messenger-images/${id}`), params = { params: Promise.resolve({ id }) }
    expect((await getMessengerImage(request, params)).status).toBe(404)
    expect(signer).not.toHaveBeenCalled()
    current.mockResolvedValue(user)
    const response = await getMessengerImage(request, params)
    expect(response.status).toBe(302); expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(signer).toHaveBeenCalledWith(`${f.id}/${id}.jpg`, 60)
    await db.update(roleplaySessions).set({ restrictedAt: NOW }).where(eq(roleplaySessions.id, f.id))
    expect((await getMessengerImage(request, params)).status).toBe(404)
    current.mockResolvedValue(null)
    expect((await getMessengerImage(request, params)).status).toBe(401)
  })

})
