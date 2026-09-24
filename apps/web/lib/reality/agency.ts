import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { characterAgencyMode, feature, POLICY, productionRuntime } from '@miro/config'
import {
  db, characters, characterDecisions, characterRuntimeStates, contactProfiles, messages,
  realityContacts, relationships, roleplaySessions, userSettings, users, worldStates,
} from '@miro/db'
import { applyRelationshipDelta, describeRelationship, localMinutes, presentContact, type SuppressReason } from '@miro/domain'
import { buildAgencyDecisionDirective, planAgencyDecision, requireSafeContent, verifyAgencyRealization } from '@miro/engine'
import { buildMockRealityContent, createAI, generateRealityContent, type LLMProvider } from '@miro/providers'
import { loadAgencyEvidence, loadAgencyRuntime } from '@/lib/agency/runtime'
import { applyMessageReceipt } from '@/lib/agency/receipts'
import { loadSession } from '@/lib/simulation/snapshot'
import { installAIUsageSink } from '@/lib/usage/ai-usage'
import { observe } from '@/lib/observe'
import { deliverRealityPush, enqueueRealityPush } from './push-outbox'
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

/** Delivery constraints only. Legacy motivation never overrides a validated agency choice. */
function deliveryBlock(profile: RealityRow['profile'], timeZone: string, recent: ContactRow[], now: Date): SuppressReason | null {
  const minute = localMinutes(now, timeZone)
  const toMinute = (value: string) => { const [h = 0, m = 0] = value.split(':').map(Number); return h * 60 + m }
  const start = toMinute(profile.activeHoursStart), end = toMinute(profile.activeHoursEnd)
  if (!(start <= end ? minute >= start && minute < end : minute >= start || minute < end)) return 'outside_active_hours'
  if (recent.filter(c => c.status === 'sent').length >= POLICY.reality.maxPending) return 'max_pending'
  const lastSent = recent.find(c => (c.status === 'sent' || c.status === 'opened') && c.sentAt)
  if (lastSent?.sentAt && now.getTime() - lastSent.sentAt.getTime() < POLICY.reality.minGapMinutes * 60_000) return 'cooldown'
  return null
}

class AgencyRealityConflict extends Error {}

/** null means the legacy path retains control (off/shadow); live never falls back to its policy. */
export async function evaluateAgencyReality(row: RealityRow, now: Date, opts: { inline?: boolean; background?: boolean }): Promise<EvaluateOutcome | null> {
  const sessionId = row.session.id, userId = row.session.userId
  const requestedMode = characterAgencyMode(sessionId)
  if (requestedMode === 'off') return null
  installAIUsageSink()
  const llm = createAI({ mock: req => buildMockRealityContent(req.prompt), context: {
    userId, sessionId, workload: opts.background ? 'background' : 'interactive', shadow: requestedMode === 'shadow',
  } })
  try {
    const loaded = await loadSession(sessionId, userId)
    if (!loaded) return requestedMode === 'shadow' ? null : { outcome: 'skipped', reason: 'session_not_found' }
    const runtime = await loadAgencyRuntime(sessionId, userId, loaded.snapshot, llm, now)
    if (!runtime && requestedMode === 'shadow') return null
    if (!runtime || (requestedMode === 'live' && runtime.mode !== 'live')) {
      // Fallback chat turns may leave a legacy intent with notBefore, which would re-claim this session on
      // every scheduler run. Proactive contact here belongs to agency once the revision is ready.
      if (row.session.pendingRealityIntent) await db.update(roleplaySessions).set({ pendingRealityIntent: null }).where(eq(roleplaySessions.id, sessionId))
      return { outcome: 'skipped', reason: 'agency_unavailable' }
    }
    // Existing sessions remain pinned to their compiled authored revision, including the renderer.
    const snapshot = { ...loaded.snapshot, character: runtime.revision.profile.character,
      worldSetting: runtime.revision.profile.worldSetting, worldGenre: runtime.revision.profile.worldGenre }
    const bucket = Math.floor(now.getTime() / (POLICY.reality.recheckMinutes * 60_000))
    const triggerKey = `reality:${bucket}:${row.session.turnCount}:${row.session.lastInteractionAt.toISOString()}`
    if (runtime.mode === 'live') {
      const [existing] = await db.select({ id: characterDecisions.id }).from(characterDecisions)
        .where(and(eq(characterDecisions.sessionId, sessionId), eq(characterDecisions.triggerKey, triggerKey))).limit(1)
      if (existing) return { outcome: 'skipped', reason: 'duplicate' }
    }
    const recent = await deliveryContacts(sessionId)
    const blocked = deliveryBlock(row.profile, timeZoneOf(row.settings), recent, now)
    // Reserve two evidence slots for the application's queued/sent attestations.
    const evidence = (await loadAgencyEvidence(sessionId, snapshot, runtime, undefined, now)).slice(-126)
    const dueGoals = runtime.state.goals.filter(goal => goal.status === 'active' && goal.clock === 'real_time'
      && goal.dueAt && Date.parse(goal.dueAt) <= now.getTime())
    if (runtime.mode === 'live' && runtime.state.sequence > 0 && dueGoals.length === 0
      && !evidence.some(item => Date.parse(item.occurredAt) > Date.parse(runtime.state.updatedAt))) return { outcome: 'no_intent' }
    const plan = await planAgencyDecision(llm, runtime.revision.compiled, runtime.state, {
      sessionId, revisionId: runtime.revision.id, actor: snapshot.character.id,
      authored: runtime.revision.authored, evidence,
      clock: { now: now.toISOString(), mode: 'real_time', trigger: 'background', allowOfflineAdvance: false },
      permissions: { contact: row.profile.enabled && blocked === null,
        capabilities: ['wait', 'defer', 'cancel_commitment', ...(blocked ? [] : ['contact', 'message', 'contact_message'])] },
      location: snapshot.world.currentLocation, world: snapshot.world, relationship: snapshot.relationship,
      input: JSON.stringify({ trigger: 'background_contact_review', supportedDispatch: 'in_app_message_only',
        contactStyle: { frequency: row.profile.contactFrequency, initiative: row.profile.initiativeLevel, replyDelayMinutes: row.profile.replyDelayMinutes },
        pendingDeliveryHint: row.session.pendingRealityIntent, deliveryBlocked: blocked,
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
      const { identity, personality, worldRole, appearance } = snapshot.character
      const renderer: LLMProvider = { info: llm.info, generateStructured: request => llm.generateStructured({
        ...request, system: request.system + buildAgencyDecisionDirective(plan.decision)
          + `\nGROUNDED_RUNTIME_DATA: ${JSON.stringify({ affect: plan.state.affect, expression: plan.state.expression,
            goals: plan.state.goals.filter(goal => goal.status === 'active'), evidence: plan.context.evidence })}`,
      }) }
      content = await generateRealityContent(renderer, {
        authoredCharacter: { identity, personality, worldRole, ...(appearance ? { appearance } : {}) },
        worldSetting: snapshot.worldSetting, worldGenre: snapshot.worldGenre,
        characterName: identity.name, personality: personality.personality, speechStyle: personality.speechStyle,
        channelLabel: presented.channelLabel, reason: plan.decision.candidate.description,
        worldLocation: snapshot.world.currentLocation, worldStatus: snapshot.world.worldStatus,
        relationshipHint: describeRelationship(snapshot.relationship), activeEventSummary: null, currentTime: now.toISOString(),
        // Renderer sees the same participant evidence as the planner, never legacy unsourced memories or omniscient prose.
        recentMessages: plan.context.evidence.filter(item => item.kind === 'message').map(item => ({
          id: item.id, role: item.actor === 'user' ? 'user' : 'character', content: item.quote, at: item.occurredAt,
          knowledgeScope: 'participant',
        })), memories: [],
      })
      // Capture the renderer result before moderation/verification can replace provider trace metadata.
      if (productionRuntime() && (llm.info.mode !== 'live' || llm.lastFallbackUsed)) return { outcome: 'skipped', reason: 'agency_unavailable' }
      await requireSafeContent(llm, { text: content.text })
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
        || !profile?.enabled || JSON.stringify(profile) !== JSON.stringify(row.profile)
        || !state || state.version !== runtime.version || state.revisionId !== runtime.revision.id || state.mode !== 'live'
        || state.state.sequence !== plan.transition.expectedSequence
        || world?.version !== snapshot.world.version || relationship?.version !== snapshot.relationship.version
        || characterAgencyMode(sessionId) !== 'live' || !feature('realityMessage')) throw new AgencyRealityConflict()
      const [duplicate] = await tx.select({ id: characterDecisions.id }).from(characterDecisions)
        .where(and(eq(characterDecisions.sessionId, sessionId), eq(characterDecisions.triggerKey, triggerKey))).limit(1)
      if (duplicate) throw new AgencyRealityConflict()
      let nextState = plan.state
      let contactId: string | null = null
      if (send && content) {
        const newest = await deliveryContacts(sessionId, tx)
        if (deliveryBlock(profile, timeZoneOf(currentSettings ?? null), newest, now)) throw new AgencyRealityConflict()
        const messageId = randomUUID()
        contactId = randomUUID()
        await tx.insert(messages).values({ id: messageId, sessionId, role: 'character', kind: 'reality_message',
          content: content.text, blocks: [{ type: 'reality', channel: 'message', reason: plan.decision.candidate.description, ...presented }],
          turnIndex: current.turnCount, createdAt: now,
        })
        await tx.insert(realityContacts).values({ id: contactId, sessionId, channel: 'message', reason: plan.decision.candidate.description,
          dedupeKey: `agency:${plan.decision.id}`, payload: { text: content.text, tone: content.tone, ...presented, decisionId: plan.decision.id },
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
      const nextDue = nextState.goals.filter(goal => goal.status === 'active' && goal.clock === 'real_time' && goal.dueAt)
        .map(goal => Date.parse(goal.dueAt!)).sort((a, b) => a - b)[0]
      const backoffMinutes = Math.min(360, POLICY.reality.recheckMinutes * 2 ** Math.min(4, nextState.sequence - 1))
      const updated = await tx.update(characterRuntimeStates).set({ state: nextState, version: sql`${characterRuntimeStates.version} + 1`, updatedAt: now,
        nextWakeAt: nextDue === undefined ? null : new Date(Math.max(nextDue, now.getTime() + backoffMinutes * 60_000)),
      }).where(and(eq(characterRuntimeStates.sessionId, sessionId), eq(characterRuntimeStates.version, runtime.version))).returning({ id: characterRuntimeStates.sessionId })
      if (updated.length !== 1) throw new AgencyRealityConflict()
      await tx.update(roleplaySessions).set({ pendingRealityIntent: null }).where(eq(roleplaySessions.id, sessionId))
      return contactId
    })
    if (!result || !content) return { outcome: 'no_intent' }
    await deliverRealityPush(now).catch(() => observe('reality.push_worker_failed', { sessionId }))
    return { outcome: 'sent', channel: 'message', contactId: result, text: content.text }
  } catch (error) {
    if (error instanceof AgencyRealityConflict || (error as { code?: string }).code === '23505') return { outcome: 'skipped', reason: 'state_changed' }
    observe('agency.reality_unavailable', { sessionId, mode: requestedMode, error: error instanceof Error ? error.name : 'unknown' })
    return requestedMode === 'shadow' ? null : { outcome: 'skipped', reason: 'agency_unavailable' }
  }
}
