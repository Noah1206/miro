import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import {
  db, users, userSettings, characters, contactProfiles, roleplaySessions, worldStates, relationships, events,
  messages, memories, realityContacts, characterRevisions, characterRuntimeStates, characterDecisions,
} from '@miro/db'
import { createAgencyState, type AgencyAction, type CompiledCharacter } from '@miro/domain'
import { hashAuthoredCharacter } from '@miro/engine'
import * as providers from '@miro/providers'
import { POLICY } from '@miro/config'
import { authoredDocument } from '@/lib/agency/authored'
import { loadAgencyEvidence, loadAgencyRuntime } from '@/lib/agency/runtime'
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
function provider(opts: { action?: AgencyAction; reject?: boolean; relationship?: boolean; goalIds?: string[]; duringRender?: () => Promise<void> } = {}) {
  const calls: Array<{ version: string; prompt: string; system: string }> = []
  const llm: providers.LLMProvider = {
    info: { mode: 'mock', name: 'agency-reality-recorded', notice: 'Synthetic contract validation, not live model evaluation.' },
    async generateStructured(request) {
      const version = request.promptVersion ?? ''
      calls.push({ version, prompt: request.prompt, system: request.system })
      if (version === 'agency-planner:v4') {
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
      if (version === 'reality:v3-character-context') {
        await opts.duringRender?.()
        return request.schema.parse({ text: '잠깐 이야기할 수 있을까요?', tone: 'neutral' })
      }
      if (version === 'agency-realization-check:v4') {
        const context = JSON.parse(request.prompt)
        return request.schema.parse({ decisionId: context.decision.id, aligned: !opts.reject, claims: [], unsupported: [],
          violations: opts.reject ? ['contradicts_decision'] : [],
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
    expect(await evaluateSession(id, NOW)).toEqual({ outcome: 'skipped', reason: 'duplicate' })
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
    const rendered = calls.find(call => call.version === 'reality:v3-character-context')!
    expect(rendered.prompt).toContain(snapshot.character.identity.name)
    expect(rendered.prompt).not.toMatch(/SECRET_NARRATOR|UNSOURCED_SECRET_MEMORY|NEW_UNPINNED_/)
    expect(rendered.system).toContain('GROUNDED_RUNTIME_DATA')
  })

  it('rejected realization persists no reply, receipt, decision or runtime proposal', async () => {
    const { id } = await fixture()
    provider({ reject: true })
    expect(await evaluateSession(id, NOW)).toEqual({ outcome: 'skipped', reason: 'agency_rejected' })
    const state = await stored(id)
    expect(state.contacts).toHaveLength(0)
    expect(state.messages).toHaveLength(0)
    expect(state.decisions).toHaveLength(0)
    expect(state.runtime.version).toBe(0)
    expect(state.runtime.state.sequence).toBe(0)
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

  it('the delivery cooldown is enforced even for inline calls and a contact proposal', async () => {
    const { id } = await fixture()
    await db.insert(realityContacts).values({ sessionId: id, channel: 'message', reason: 'previous', dedupeKey: randomUUID(), status: 'opened', sentAt: BEFORE })
    const { calls } = provider()
    expect(await evaluateSession(id, NOW, { inline: true })).toEqual({ outcome: 'no_intent' })
    expect(JSON.parse(calls[0]!.prompt).permissions.contact).toBe(false)
    expect(calls.filter(call => call.version === 'reality:v3-character-context')).toHaveLength(0)
    expect((await stored(id)).messages).toHaveLength(0)
  })

  it('counts old unread contacts even behind many newer opened contacts', async () => {
    const { id } = await fixture()
    const old = new Date(NOW.getTime() - (POLICY.reality.minGapMinutes + 60) * 60_000)
    await db.insert(realityContacts).values(Array.from({ length: 14 }, (_, index) => ({ sessionId: id, channel: 'message' as const,
      reason: 'previous', dedupeKey: randomUUID(), status: index < POLICY.reality.maxPending ? 'sent' as const : 'opened' as const,
      sentAt: new Date(old.getTime() + index), createdAt: new Date(old.getTime() + index),
    })))
    const { calls } = provider()
    expect(await evaluateSession(id, NOW)).toEqual({ outcome: 'no_intent' })
    expect(JSON.parse(JSON.parse(calls[0]!.prompt).input).deliveryBlocked).toBe('max_pending')
    expect((await stored(id)).messages).toHaveLength(0)
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
})
