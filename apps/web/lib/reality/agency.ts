import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { characterAgencyMode, feature, POLICY, productionRuntime } from '@miro/config'
import {
  db, characters, characterDecisions, characterRuntimeStates, contactProfiles, messages,
  realityContacts, relationships, roleplaySessions, stateTransitions, userSettings, users, worldStates,
} from '@miro/db'
import { agencyClock, applyRelationshipDelta, authoredCharacter, describeRelationship, languageRule, localClock, localMinutes, personaLines, presentContact, RELATIONSHIP_DIMENSIONS, withRelationshipProfile, type RealityIntent, type SuppressReason } from '@miro/domain'
import { buildAgencyDecisionDirective, planAgencyDecision, verifyAgencyRealization } from '@miro/engine'
import { buildMockRealityContent, createAI, generateRealityContent, type LLMProvider } from '@miro/providers'
import { loadAgencyEvidence, loadAgencyRuntime } from '@/lib/agency/runtime'
import { applyMessageReceipt } from '@/lib/agency/receipts'
import { loadSession } from '@/lib/simulation/snapshot'
import { installAIUsageSink } from '@/lib/usage/ai-usage'
import { observe } from '@/lib/observe'
import { deliverRealityPush, enqueueRealityPush } from './push-outbox'
import { characterAvailability } from './routine'
import type { EvaluateOutcome } from './evaluate'

type RealityRow = {
  session: typeof roleplaySessions.$inferSelect
  character: typeof characters.$inferSelect
  profile: typeof contactProfiles.$inferSelect
  settings: typeof userSettings.$inferSelect | null
}
type ContactRow = typeof realityContacts.$inferSelect

/** Older unread contacts still count even after newer contacts have been opened. */
async function deliveryContacts(sessionId: string, query: Pick<typeof db, 'select'> = db): Promise<ContactRow[]> {
  const [pending, last] = await Promise.all([
    query.select().from(realityContacts).where(and(eq(realityContacts.sessionId, sessionId), eq(realityContacts.status, 'sent')))
      .limit(POLICY.reality.maxPending),
    query.select().from(realityContacts).where(and(eq(realityContacts.sessionId, sessionId), inArray(realityContacts.status, ['sent', 'opened'])))
      .orderBy(desc(realityContacts.sentAt)).limit(1),
  ])
  return [...new Map([...last, ...pending].map(contact => [contact.id, contact])).values()]
}

/** The user's time zone is the only setting read; out-of-app contact cannot be turned off (2026-09-24). */
const timeZoneOf = (settings: RealityRow['settings']): string => settings?.timeZone ?? POLICY.reality.defaultTimeZone

/**
 * 기존 규칙이 찾은 연락 기회(첫 연락·조용함·식사 안부·헤어진 뒤·사건·답장 대기). 자율성 경로에서는 판단 재료일 뿐 — 보낼지는 캐릭터(계획)가 정한다(2026-10-02).
 * key 는 그 기회의 정체성(contactDedupeKey): 같은 기회로 두 번 보내지 않고, 이번엔 안 보내기로 한 기회를 같은 날 다시 묻지 않는다.
 */
export type ContactHint = { opportunity: RealityIntent | null; opportunityKey: string | null; contactsToday: number; dailyCap: number }

/**
 * Delivery constraints only. Legacy motivation never overrides a validated agency choice.
 * 생활 리듬(§5 채널 일관성)은 legacy 와 같은 규칙: 자는 중이면 아무것도, 바쁘면 보내지 않는다 — 판단이 아니라 전달 제약이다.
 * 사용자 문자에 대한 답장은 안 읽은 연락 수·간격·하루 상한으로 막지 않는다(legacy 와 같다).
 */
function deliveryBlock(profile: RealityRow['profile'], timeZone: string, recent: ContactRow[], now: Date, availability?: 'free' | 'busy' | 'unreachable',
  limits: { reply?: boolean; contactsToday?: number; dailyCap?: number } = {}): SuppressReason | null {
  if (availability === 'unreachable') return 'outside_active_hours'
  if (availability === 'busy') return 'busy'
  const minute = localMinutes(now, timeZone)
  const toMinute = (value: string) => { const [h = 0, m = 0] = value.split(':').map(Number); return h * 60 + m }
  const start = toMinute(profile.activeHoursStart), end = toMinute(profile.activeHoursEnd)
  if (!(start <= end ? minute >= start && minute < end : minute >= start || minute < end)) return 'outside_active_hours'
  if (limits.reply) return null
  if (recent.filter(c => c.status === 'sent').length >= POLICY.reality.maxPending) return 'max_pending'
  const lastSent = recent.find(c => (c.status === 'sent' || c.status === 'opened') && c.sentAt)
  if (lastSent?.sentAt && now.getTime() - lastSent.sentAt.getTime() < POLICY.reality.minGapMinutes * 60_000) return 'cooldown'
  if (limits.dailyCap !== undefined && (limits.contactsToday ?? 0) >= limits.dailyCap) return 'daily_cap'
  return null
}

class AgencyRealityConflict extends Error {}

/** null means the legacy path retains control (off/shadow); live never falls back to its policy. */
export async function evaluateAgencyReality(row: RealityRow, now: Date, opts: { inline?: boolean; background?: boolean }, hint?: ContactHint): Promise<EvaluateOutcome | null> {
  const sessionId = row.session.id, userId = row.session.userId
  const requestedMode = characterAgencyMode(sessionId, row.session.policyVersion)
  if (requestedMode === 'off') return null
  installAIUsageSink()
  const llm = createAI({ mock: req => buildMockRealityContent(req.prompt), context: {
    userId, sessionId, workload: opts.background ? 'background' : 'interactive', shadow: requestedMode === 'shadow',
    origin: 'reality:agency:reality:miro:background', adult: row.session.adultSince !== null,
  } })
  try {
    const loaded = await loadSession(sessionId, userId)
    if (!loaded) return requestedMode === 'shadow' ? null : { outcome: 'skipped', reason: 'session_not_found' }
    const runtime = await loadAgencyRuntime(sessionId, userId, loaded.snapshot, llm, now, row.session.policyVersion)
    if (!runtime && requestedMode === 'shadow') return null
    if (!runtime || (requestedMode === 'live' && runtime.mode !== 'live')) {
      // 판이 준비되기 전엔 새 자율 연락을 보류한다(§6.3) — 기존 경로로 대신 보내지 않는다. 남은 legacy 의도는 지운다(두면 매 주기 다시 잡힌다).
      // 사용자 문자에 대한 답장은 지우지 않고 다음 확인으로 미룬다 — 판이 준비되면 답한다(전엔 이 사이에 답장이 사라졌다).
      const pending = row.session.pendingRealityIntent
      if (pending) await db.update(roleplaySessions).set({ pendingRealityIntent: pending.answers
        ? { ...pending, notBefore: new Date(now.getTime() + POLICY.reality.recheckMinutes * 60_000).toISOString() } : null }).where(eq(roleplaySessions.id, sessionId))
      return { outcome: 'skipped', reason: 'agency_unavailable' }
    }
    // Existing sessions remain pinned to their compiled authored revision, including the renderer.
    // 관계 성격표는 판에 고정하지 않는다 — 설정에서 파생돼 따로 갱신되므로 지금의 표를 얹는다.
    const snapshot = { ...loaded.snapshot, character: withRelationshipProfile(runtime.revision.profile.character, loaded.snapshot.character.personality.relationshipProfile),
      worldSetting: runtime.revision.profile.worldSetting, worldGenre: runtime.revision.profile.worldGenre }
    const bucket = Math.floor(now.getTime() / (POLICY.reality.recheckMinutes * 60_000))
    // 연락 기회로 판단하면 그 기회가 곧 트리거다 — 보내지 않기로 한 기회를 같은 날 30분마다 다시 묻지 않는다(계획 호출 비용).
    const triggerKey = hint?.opportunityKey ? `reality:opportunity:${hint.opportunityKey}` : `reality:${bucket}:${row.session.turnCount}:${row.session.lastInteractionAt.toISOString()}`
    const reply = hint?.opportunity?.answers === 'user_message'
    if (runtime.mode === 'live') {
      const [existing] = await db.select({ id: characterDecisions.id }).from(characterDecisions)
        .where(and(eq(characterDecisions.sessionId, sessionId), eq(characterDecisions.triggerKey, triggerKey))).limit(1)
      if (existing) return { outcome: 'skipped', reason: 'duplicate' }
    }
    const recent = await deliveryContacts(sessionId)
    // 리듬이 없으면 배경에서 만든다. inline(사용자 턴 직후)에서는 기다리지 않는다 — 사용자의 응답에 모델 호출을 얹지 않게.
    const availability = await characterAvailability(row.character.id, now, timeZoneOf(row.settings), { wait: !opts.inline })
    const limits = { reply, contactsToday: hint?.contactsToday, dailyCap: hint?.dailyCap }
    const blocked = deliveryBlock(row.profile, timeZoneOf(row.settings), recent, now, availability.availability, limits)
    // Reserve two evidence slots for the application's queued/sent attestations.
    const evidence = (await loadAgencyEvidence(sessionId, snapshot, runtime, undefined, now)).slice(-126)
    const dueGoals = runtime.state.goals.filter(goal => goal.status === 'active' && goal.clock === 'real_time'
      && goal.dueAt && Date.parse(goal.dueAt) <= now.getTime())
    // 자기 삶의 일은 이야기하고 싶을 만한 것(shareable)만 판단을 깨운다 — 나머지는 다음 대화에서 근거로 읽힌다(계획 호출 비용).
    const isNew = (item: typeof evidence[number]) => Date.parse(item.occurredAt) > Date.parse(runtime.state.updatedAt)
    const ownDay = evidence.filter(item => item.kind === 'event' && item.shareable && isNew(item)).map(item => item.id)
    const freshOther = evidence.some(item => item.kind !== 'event' && isNew(item))
    if (runtime.mode === 'live' && runtime.state.sequence > 0 && dueGoals.length === 0 && !hint?.opportunity && !freshOther && !ownDay.length) return { outcome: 'no_intent' }
    // 연락 기회나 자기 일만으로 깨어났는데 지금은 보낼 수 없으면(자는 중·바쁨·간격·상한) 계획을 부르지 않는다 — 막힌 동안 매번 묻는 건 비용이고,
    // 부르지 않으면 자기 일은 새것으로 남아 보낼 수 있을 때 다시 판단된다(불렀다면 '기다림'으로 소비됐다).
    if (runtime.mode === 'live' && blocked && dueGoals.length === 0 && !freshOther && (hint?.opportunity || ownDay.length)) return { outcome: 'suppressed', reason: blocked }
    const plan = await planAgencyDecision(llm, runtime.revision.compiled, runtime.state, {
      sessionId, revisionId: runtime.revision.id, actor: snapshot.character.id,
      authored: runtime.revision.authored, evidence,
      clock: agencyClock(now, timeZoneOf(row.settings), 'background'),
      permissions: { contact: row.profile.enabled && blocked === null,
        capabilities: ['wait', 'defer', 'cancel_commitment', ...(blocked ? [] : ['contact', 'message', 'contact_message'])] },
      location: snapshot.world.currentLocation, world: snapshot.world, relationship: snapshot.relationship,
      input: JSON.stringify({ trigger: 'background_contact_review', supportedDispatch: 'in_app_message_only',
        contactStyle: { frequency: row.profile.contactFrequency, initiative: row.profile.initiativeLevel, replyDelayMinutes: row.profile.replyDelayMinutes },
        pendingDeliveryHint: row.session.pendingRealityIntent, deliveryBlocked: blocked,
        contactOpportunity: hint?.opportunity ? { reason: hint.opportunity.reason, urgency: hint.opportunity.urgency, answers: hint.opportunity.answers ?? null } : null,
        ownDay,
      }),
    })
    if (runtime.mode === 'shadow') {
      observe('agency.reality_shadow', { sessionId, action: plan.decision.action, providerMode: plan.providerMode })
      return null
    }
    if (productionRuntime() && plan.providerMode !== 'live') return { outcome: 'skipped', reason: 'agency_unavailable' }
    if (!['contact', 'wait', 'defer', 'cancel_commitment'].includes(plan.decision.action)) return { outcome: 'skipped', reason: 'agency_rejected' }

    const send = plan.decision.action === 'contact'
    if (send && blocked) return { outcome: 'suppressed', reason: blocked }
    const presented = presentContact('message', snapshot.character.identity.name, row.profile.presentation)
    let content: Awaited<ReturnType<typeof generateRealityContent>> | null = null
    if (send) {
      const { identity, personality, worldRole, appearance } = authoredCharacter(snapshot.character)
      const renderer: LLMProvider = { info: llm.info, generateStructured: request => llm.generateStructured({
        ...request, system: request.system + buildAgencyDecisionDirective(plan.decision)
          + `\nGROUNDED_RUNTIME_DATA: ${JSON.stringify({ affect: plan.state.affect, expression: plan.state.expression,
            goals: plan.state.goals.filter(goal => goal.status === 'active'), evidence: plan.context.evidence })}`,
      }) }
      content = await generateRealityContent(renderer, {
        authoredCharacter: { identity, personality, worldRole, ...(appearance ? { appearance } : {}) },
        worldSetting: snapshot.worldSetting, worldGenre: snapshot.worldGenre,
        userPersona: snapshot.userPersona ? personaLines(snapshot.userPersona) : null,
        languageRule: languageRule(snapshot.userLanguage),
        characterName: identity.name, personality: personality.personality, speechStyle: personality.speechStyle,
        channelLabel: presented.channelLabel, reason: plan.decision.candidate.description,
        worldLocation: snapshot.world.currentLocation, worldStatus: snapshot.world.worldStatus,
        relationshipHint: describeRelationship(snapshot.relationship), activeEventSummary: null,
        currentTime: `${localClock(now, timeZoneOf(row.settings)).label} (${localClock(now, timeZoneOf(row.settings)).period})`,
        // Renderer sees the same participant evidence as the planner, never legacy unsourced memories or omniscient prose.
        recentMessages: plan.context.evidence.filter(item => item.kind === 'message').map(item => ({
          id: item.id, role: item.actor === 'user' ? 'user' : 'character', content: item.quote, at: item.occurredAt,
          knowledgeScope: 'participant',
        })), memories: [],
      })
      // Capture the renderer result before verification can replace provider trace metadata. 예비 모델의 답도 live 다(10/2).
      if (productionRuntime() && llm.info.mode !== 'live') return { outcome: 'skipped', reason: 'agency_unavailable' }
      const verified = await verifyAgencyRealization(llm, { decision: plan.decision, context: plan.context,
        state: runtime.state, blocks: [{ type: 'dialogue', speaker: identity.name, text: content.text }] })
      if (!verified.ok || (productionRuntime() && verified.providerMode !== 'live')) return { outcome: 'skipped', reason: 'agency_rejected' }
    }

    const result = await db.transaction(async tx => {
      const [current] = await tx.select().from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)).for('update')
      const [profile] = await tx.select().from(contactProfiles).where(eq(contactProfiles.id, row.profile.id)).for('share')
      const [state] = await tx.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, sessionId)).for('update')
      const [owner] = await tx.select().from(users).where(eq(users.id, userId)).for('share')
      const [character] = await tx.select().from(characters).where(eq(characters.id, row.character.id)).for('share')
      const [world] = await tx.select().from(worldStates).where(eq(worldStates.sessionId, sessionId))
      const [relationship] = await tx.select().from(relationships).where(eq(relationships.sessionId, sessionId))
      const [currentSettings] = await tx.select().from(userSettings).where(eq(userSettings.userId, userId)).for('share')
      if (!current || current.userId !== userId || current.characterId !== row.character.id || current.worldId !== row.session.worldId
        || current.deletedAt || current.restrictedAt || current.status !== 'active'
        || current.turnCount !== row.session.turnCount || current.lastInteractionAt.getTime() !== row.session.lastInteractionAt.getTime()
        || !owner || owner.deletedAt || !character || character.deletedAt || character.experienceType !== 'reality'
        // 생활 리듬(routine)은 제작자 설정이 아니라 뒤에서 만들어지는 파생 값이다 — 그게 채워졌다고 판단을 버리지 않는다.
        || !profile?.enabled || JSON.stringify({ ...profile, routine: null }) !== JSON.stringify({ ...row.profile, routine: null })
        || !state || state.version !== runtime.version || state.revisionId !== runtime.revision.id || state.mode !== 'live'
        || state.state.sequence !== plan.transition.expectedSequence
        || world?.version !== snapshot.world.version || relationship?.version !== snapshot.relationship.version
        || characterAgencyMode(sessionId, current.policyVersion) !== 'live' || !feature('realityMessage')) throw new AgencyRealityConflict()
      const [duplicate] = await tx.select({ id: characterDecisions.id }).from(characterDecisions)
        .where(and(eq(characterDecisions.sessionId, sessionId), eq(characterDecisions.triggerKey, triggerKey))).limit(1)
      if (duplicate) throw new AgencyRealityConflict()
      let nextState = plan.state
      let contactId: string | null = null
      if (send && content) {
        const newest = await deliveryContacts(sessionId, tx)
        if (deliveryBlock(profile, timeZoneOf(currentSettings ?? null), newest, now, availability.availability, limits)) throw new AgencyRealityConflict()
        const messageId = randomUUID()
        contactId = randomUUID()
        await tx.insert(messages).values({ id: messageId, sessionId, role: 'character', kind: 'reality_message',
          content: content.text, blocks: [{ type: 'reality', channel: 'message', reason: plan.decision.candidate.description, ...presented }],
          turnIndex: current.turnCount, createdAt: now,
        })
        await tx.insert(realityContacts).values({ id: contactId, sessionId, channel: 'message', reason: plan.decision.candidate.description,
          // 연락 기회로 보낸 것이면 그 기회의 키로 — 같은 기회(첫 연락·오늘의 안부·같은 사건)로는 다시 보내지 않는다(기존 경로와 같은 키).
          dedupeKey: hint?.opportunityKey ?? `agency:${plan.decision.id}`,
          payload: { text: content.text, tone: content.tone, ...presented, decisionId: plan.decision.id, ...(reply ? { answers: 'user_message' } : {}) },
          status: 'sent', sentAt: now, messageId,
        })
        nextState = applyMessageReceipt(plan, messageId)
        await enqueueRealityPush(tx, contactId, userId)
      }
      if (Object.keys(plan.relationshipDelta).length) {
        const next = applyRelationshipDelta(snapshot.relationship, plan.relationshipDelta)
        const changed = await tx.update(relationships).set({
          trust: next.trust, attraction: next.attraction, jealousy: next.jealousy, protectiveness: next.protectiveness,
          emotionalDistance: next.emotionalDistance, attachment: next.attachment, version: snapshot.relationship.version + 1, updatedAt: now,
        }).where(and(eq(relationships.sessionId, sessionId), eq(relationships.version, snapshot.relationship.version))).returning({ id: relationships.id })
        if (changed.length !== 1) throw new AgencyRealityConflict()
      }
      await tx.insert(characterDecisions).values({ sessionId, revisionId: runtime.revision.id, triggerKey,
        mode: 'live', decision: plan.decision, providerMode: plan.providerMode,
      })
      // 원장(§3.4): 선연락도 대화와 같은 원장에, 같은 정책 버전으로. 발송은 '저장·큐 등록' 까지만 사실이다 — 도달·열람은 별개.
      const nextRelationship = applyRelationshipDelta(snapshot.relationship, plan.relationshipDelta)
      const relationshipVersion = snapshot.relationship.version + (Object.keys(plan.relationshipDelta).length ? 1 : 0)
      const ledger = [
        ...RELATIONSHIP_DIMENSIONS.filter(dim => nextRelationship[dim] !== snapshot.relationship[dim]).map(dim => ({
          field: `relationship.${dim}`, before: snapshot.relationship[dim], after: nextRelationship[dim], rule: 'relationship_appraisal', status: 'applied' as const, clock: 'real' as const })),
        ...(plan.transition.goals ?? []).map(change => ({ field: `agency.goal.${change.kind === 'add' ? change.goal.id : change.goalId}`, after: change.kind, rule: 'goal_change', status: 'applied' as const, clock: 'real' as const })),
        ...(contactId ? [{ field: 'contact.message', after: 'queued', rule: 'contact_dispatched', status: 'applied' as const, clock: 'real' as const, outcomeRef: contactId }] : []),
      ]
      if (ledger.length) await tx.insert(stateTransitions).values(ledger.map((r, seq) => ({
        sessionId, triggerKey: `reality:${triggerKey}`, seq, policyVersion: 'turn-policy:v1', engine: 'agency' as const, revisionId: runtime.revision.id,
        decisionId: plan.decision.id, causeMessageId: null, actor: snapshot.character.id, field: r.field, before: 'before' in r ? r.before : null, after: r.after, rule: r.rule,
        status: r.status, clock: r.clock, worldVersion: snapshot.world.version, relationshipVersion,
        runtimeVersion: runtime.version + 1, outcomeRef: 'outcomeRef' in r ? r.outcomeRef : null,
      })))
      const nextDue = nextState.goals.filter(goal => goal.status === 'active' && goal.clock === 'real_time' && goal.dueAt)
        .map(goal => Date.parse(goal.dueAt!)).sort((a, b) => a - b)[0]
      const backoffMinutes = Math.min(360, POLICY.reality.recheckMinutes * 2 ** Math.min(4, nextState.sequence - 1))
      const updated = await tx.update(characterRuntimeStates).set({ state: nextState, version: sql`${characterRuntimeStates.version} + 1`, updatedAt: now,
        nextWakeAt: nextDue === undefined ? null : new Date(Math.max(nextDue, now.getTime() + backoffMinutes * 60_000)),
      }).where(and(eq(characterRuntimeStates.sessionId, sessionId), eq(characterRuntimeStates.version, runtime.version))).returning({ id: characterRuntimeStates.sessionId })
      if (updated.length !== 1) throw new AgencyRealityConflict()
      // 사용자 문자에 아직 답하지 않았으면(바쁨·대기 결정) 답장 의도를 남겨 다음에 다시 본다 — 답장은 사라지면 안 된다.
      const keepReply = reply && !contactId && row.session.pendingRealityIntent
      await tx.update(roleplaySessions).set({ pendingRealityIntent: keepReply ? { ...row.session.pendingRealityIntent!,
        notBefore: new Date(now.getTime() + POLICY.reality.recheckMinutes * 60_000).toISOString() } : null }).where(eq(roleplaySessions.id, sessionId))
      return contactId
    })
    if (!result || !content) return { outcome: 'no_intent' }
    // 지금 시각으로 — 판단 시각(now)으로 찾으면 방금 넣은 알림 작업을 못 집는다(evaluate.ts 와 같다).
    await deliverRealityPush().catch(() => observe('reality.push_worker_failed', { sessionId }))
    return { outcome: 'sent', channel: 'message', contactId: result, text: content.text }
  } catch (error) {
    if (error instanceof AgencyRealityConflict || (error as { code?: string }).code === '23505') return { outcome: 'skipped', reason: 'state_changed' }
    observe('agency.reality_unavailable', { sessionId, mode: requestedMode, error: error instanceof Error ? error.name : 'unknown' })
    return requestedMode === 'shadow' ? null : { outcome: 'skipped', reason: 'agency_unavailable' }
  }
}
