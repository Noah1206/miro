import { inboxTrigger, type InboxReview } from '@/lib/messenger/inbox'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { characterAgencyMode, feature, POLICY, productionRuntime } from '@miro/config'
import {
  db, messengerInbox, characters, characterDecisions, characterRuntimeStates, contactProfiles, messages,
  realityContacts, relationships, roleplaySessions, stateTransitions, userSettings, users, worldStates,
} from '@miro/db'
import { AGENCY_FALLBACK_WAIT_ID, agencyClock, applyRelationshipDelta, authoredCharacter, contactBoundaryActive, contactBoundaryDirective, describeRelationship, languageRule, localClock, localMinutes, personaLines, presentContact, RELATIONSHIP_DIMENSIONS, withRelationshipProfile, type RealityIntent, type SuppressReason } from '@miro/domain'
import { buildAgencyDecisionDirective, planAgencyDecision, verifyAgencyRealization, needsCommunicationPreferenceReview, agencyCommunicationPreferences, communicationPreferenceData, COMMUNICATION_PREFERENCE_RULE } from '@miro/engine'
import { buildMockRealityContent, createAI, generateRealityContent, type LLMProvider } from '@miro/providers'
import { loadAgencyEvidence, loadAgencyRuntime } from '@/lib/agency/runtime'
import { applyMessageReceipt } from '@/lib/agency/receipts'
import { loadSession } from '@/lib/simulation/snapshot'
import { installAIUsageSink } from '@/lib/usage/ai-usage'
import { observe } from '@/lib/observe'
import { deliverRealityPush, enqueueRealityPush } from './push-outbox'
import { characterAvailability } from './routine'
import { activeMoments } from './moments'
import type { EvaluateOutcome } from './evaluate'
import { messengerPhotosReady, prepareMessengerPhoto } from '@/lib/messenger/photos'
import { REPLY_DISPOSITION_VERSION, nextReplyReview, readReplyDisposition } from '@/lib/messenger/reply-disposition'
import { conversationVariationDirective, repeatedConversationBlock, snapshotUserGrounding } from '@miro/engine'
import { resolveChatModel } from '@/lib/ai/chat-models'

type RealityRow = {
  session: typeof roleplaySessions.$inferSelect
  character: typeof characters.$inferSelect
  profile: typeof contactProfiles.$inferSelect
  settings: typeof userSettings.$inferSelect | null
}
type ContactRow = typeof realityContacts.$inferSelect

/** Notification permissions are enforced by the outbox; character rhythm uses local time. */
const timeZoneOf = (settings: RealityRow['settings']): string => settings?.timeZone ?? POLICY.reality.defaultTimeZone

/**
 * 기존 규칙이 찾은 연락 기회(첫 연락·조용함·식사 안부·헤어진 뒤·사건·답장 대기). 자율성 경로에서는 판단 재료일 뿐 — 보낼지는 캐릭터(계획)가 정한다(2026-10-02).
 * key 는 그 기회의 정체성(contactDedupeKey): 같은 기회로 두 번 보내지 않고, 이번엔 안 보내기로 한 기회를 같은 날 다시 묻지 않는다.
 */
export type ContactHint = { opportunity: RealityIntent | null; opportunityKey: string | null }

/**
 * Delivery constraints only. Legacy motivation never overrides a validated agency choice.
 * 생활 리듬(§5 채널 일관성)은 legacy 와 같은 규칙: 자는 중이면 아무것도, 바쁘면 보내지 않는다 — 판단이 아니라 전달 제약이다.
 * 연락 수·간격·안 읽은 수 같은 숫자 상한은 두지 않는다(10/16) — 얼마나 자주는 캐릭터가 정한다.
 * 사용자가 말한 일정을 챙기는 연락(timely)도 — 때를 놓치면 뜻이 없다. 바쁠 때도 짧은 문자는 된다(legacy 의 긴급 연락과 같다, 10/9).
 */
function deliveryBlock(profile: RealityRow['profile'], timeZone: string, now: Date, availability?: 'free' | 'busy' | 'unreachable',
  limits: { timely?: boolean } = {}): SuppressReason | null {
  if (availability === 'unreachable') return 'outside_active_hours'
  if (availability === 'busy' && !limits.timely) return 'busy'
  const minute = localMinutes(now, timeZone)
  const toMinute = (value: string) => { const [h = 0, m = 0] = value.split(':').map(Number); return h * 60 + m }
  const start = toMinute(profile.activeHoursStart), end = toMinute(profile.activeHoursEnd)
  if (!(start <= end ? minute >= start && minute < end : minute >= start || minute < end)) return 'outside_active_hours'
  // 몇 통·몇 분 간격·안 읽은 수 같은 숫자 상한은 없다(10/16 사용자 결정) — 연락할지·얼마나 자주는 캐릭터가 성격과 관계로 정한다.
  return null
}

class AgencyRealityConflict extends Error {}

/** null means the legacy path retains control (off/shadow); live never falls back to its policy. */
export async function evaluateAgencyReality(row: RealityRow, now: Date, opts: { inline?: boolean; background?: boolean; inbox?: InboxReview }, hint?: ContactHint): Promise<EvaluateOutcome | null> {
  if (!opts.inbox && contactBoundaryActive(row.session.contactBoundary, now)) return { outcome: 'suppressed', reason: 'user_boundary' }
  const sessionId = row.session.id, userId = row.session.userId
  const requestedMode = characterAgencyMode(sessionId, row.session.policyVersion)
  if (requestedMode === 'off') return null
  const replyModel = opts.inbox?.chatModel ? await resolveChatModel(userId, opts.inbox.chatModel, row.session.adultSince !== null) : undefined
  installAIUsageSink()
  const llm = createAI({ mock: req => buildMockRealityContent(req.prompt), context: {
    userId, sessionId, workload: opts.background ? 'background' : 'interactive', shadow: requestedMode === 'shadow',
    origin: 'reality:agency:reality:miro:background', adult: row.session.adultSince !== null,
    dialogueModelId: replyModel?.modelId,
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
      if (pending && !opts.inbox) await db.update(roleplaySessions).set({ pendingRealityIntent: pending.answers
        ? { ...pending, notBefore: new Date(now.getTime() + POLICY.reality.recheckMinutes * 60_000).toISOString() } : null }).where(eq(roleplaySessions.id, sessionId))
      return { outcome: 'skipped', reason: 'agency_unavailable' }
    }
    // Existing sessions remain pinned to their compiled authored revision, including the renderer.
    // 관계 성격표는 판에 고정하지 않는다 — 설정에서 파생돼 따로 갱신되므로 지금의 표를 얹는다.
    const snapshot = { ...loaded.snapshot, character: withRelationshipProfile(runtime.revision.profile.character, loaded.snapshot.character.personality.relationshipProfile),
      worldSetting: runtime.revision.profile.worldSetting, worldGenre: runtime.revision.profile.worldGenre }
    const bucket = Math.floor(now.getTime() / (POLICY.reality.recheckMinutes * 60_000))
    // 연락 기회로 판단하면 그 기회가 곧 트리거다 — 보내지 않기로 한 기회를 같은 날 30분마다 다시 묻지 않는다(계획 호출 비용).
    const triggerKey = opts.inbox ? `${inboxTrigger(opts.inbox.ids)}:${runtime.state.sequence}` : hint?.opportunityKey ? `reality:opportunity:${hint.opportunityKey}` : `reality:${bucket}:${row.session.turnCount}:${row.session.lastInteractionAt.toISOString()}`
    const reply = !!opts.inbox || hint?.opportunity?.answers === 'user_message'
    if (runtime.mode === 'live') {
      const [existing] = await db.select({ id: characterDecisions.id }).from(characterDecisions)
        .where(and(eq(characterDecisions.sessionId, sessionId), eq(characterDecisions.triggerKey, triggerKey))).limit(1)
      if (existing) return { outcome: 'skipped', reason: 'duplicate' }
    }
    // 리듬이 없으면 배경에서 만든다. inline(사용자 턴 직후)에서는 기다리지 않는다 — 사용자의 응답에 모델 호출을 얹지 않게.
    const availability = await characterAvailability(row.character.id, now, timeZoneOf(row.settings), { wait: !opts.inline })
    const userSchedule = await activeMoments(sessionId, now)
    const limits = { timely: !!hint?.opportunity?.momentKey || !!hint?.opportunity?.promise }
    const blocked = deliveryBlock(row.profile, timeZoneOf(row.settings), now, availability.availability, limits)
    // A delivery restriction is not a personality decision to ignore someone. Keep the
    // read inbox item retryable; do not consume its trigger or mark it permanently left.
    if (opts.inbox && blocked) return { outcome: 'suppressed', reason: blocked }
    // Reserve two evidence slots for the application's queued/sent attestations.
    const evidence = (await loadAgencyEvidence(sessionId, snapshot, runtime, undefined, now, opts.inbox?.ids)).slice(-126)
    const dueGoals = runtime.state.goals.filter(goal => goal.status === 'active' && goal.clock === 'real_time'
      && goal.dueAt && Date.parse(goal.dueAt) <= now.getTime())
    // 자기 삶의 일은 이야기하고 싶을 만한 것(shareable)만 판단을 깨운다 — 나머지는 다음 대화에서 근거로 읽힌다(계획 호출 비용).
    const isNew = (item: typeof evidence[number]) => Date.parse(item.occurredAt) > Date.parse(runtime.state.updatedAt)
    const ownDay = evidence.filter(item => item.kind === 'event' && item.shareable && isNew(item)).map(item => item.id)
    const freshOther = evidence.some(item => item.kind !== 'event' && isNew(item))
    if (!opts.inbox && runtime.mode === 'live' && runtime.state.sequence > 0 && dueGoals.length === 0 && !hint?.opportunity && !freshOther && !ownDay.length) return { outcome: 'no_intent' }
    // 연락 기회나 자기 일만으로 깨어났는데 지금은 보낼 수 없으면(자는 중·바쁨·간격·상한) 계획을 부르지 않는다 — 막힌 동안 매번 묻는 건 비용이고,
    // 부르지 않으면 자기 일은 새것으로 남아 보낼 수 있을 때 다시 판단된다(불렀다면 '기다림'으로 소비됐다).
    if (runtime.mode === 'live' && blocked && dueGoals.length === 0 && !freshOther && (hint?.opportunity || ownDay.length)) return { outcome: 'suppressed', reason: blocked }
    const plan = await planAgencyDecision(llm, runtime.revision.compiled, runtime.state, {
      sessionId, revisionId: runtime.revision.id, actor: snapshot.character.id,
      authored: runtime.revision.authored, evidence,
      clock: agencyClock(now, timeZoneOf(row.settings), 'background'),
      permissions: { contact: (row.profile.enabled || !!opts.inbox) && blocked === null,
        capabilities: ['wait', 'defer', 'cancel_commitment', ...(blocked ? [] : ['contact', 'message', 'contact_message'])] },
      location: snapshot.world.currentLocation, world: snapshot.world, relationship: snapshot.relationship,
      input: JSON.stringify({ trigger: opts.inbox ? 'incoming_messenger_read' : 'background_contact_review', supportedDispatch: messengerPhotosReady() ? 'in_app_message_with_optional_photo' : 'in_app_message_only',
        contactStyle: { frequency: row.profile.contactFrequency, initiative: row.profile.initiativeLevel, replyDelayMinutes: row.profile.replyDelayMinutes,
          photoProbability: row.profile.photoProbability },
        photoRule: messengerPhotosReady() ? 'An everyday photo may optionally accompany a message after a separate grounded choice and successful generation. Every contact purpose must remain meaningful as plain text if no photo is attached. Do not mark a photo-dependent goal fulfilled by text alone. User requests never force photo consent. Do not claim a photo was already captured or sent.' : null,
        contactBoundary: contactBoundaryDirective(row.session.contactBoundary, now),
        incomingMessageIds: opts.inbox?.ids ?? [],
        userSchedule: userSchedule.map(moment => ({ about: moment.about, eventAt: moment.eventAt.toISOString(), hasTime: moment.hasTime })),
        messengerRule: opts.inbox ? 'These user messages were actually read. Answer a concrete question or an invitation to continue your own outreach in character when available; a short honest answer is enough. Decide from authored motives and actual boundaries, never from a proactive frequency cap. A closing acknowledgement may need no answer. Do not invent a typing action or promise an automatic reply. Only choose silence for a concrete character-grounded reason, not a generic desire to wait.' : null,
        pendingDeliveryHint: opts.inbox ? null : row.session.pendingRealityIntent, deliveryBlocked: blocked,
        // user_moment = 사용자가 직접 말한 일정(응원·끝난 뒤 묻기). 사람이라면 기억하고 챙길 때다. promise_to_keep = 대화에서 직접 한 '이따 문자할게' 약속(10/19).
        contactOpportunity: hint?.opportunity ? { kind: hint.opportunity.momentKey ? 'user_moment' : hint.opportunity.promise ? 'promise_to_keep' : 'routine', reason: hint.opportunity.reason, urgency: hint.opportunity.urgency, answers: hint.opportunity.answers ?? null } : null,
        ownDay,
        // 자기 입으로 한 약속(10/19 실측: 그냥 두면 '보내지 않음'을 골랐다) — 설정상 불가능한 게 아니면 지킨다.
        promiseRule: hint?.opportunity?.promise ? 'promise_to_keep is this character\'s own explicit promise in the conversation evidence to message the user around now. A person who promised keeps it: choose contact unless an authored constraint or a real delivery block makes it impossible. Keep it light and natural, continuing that conversation.' : null,
      }),
    })
    if (runtime.mode === 'shadow') {
      observe('agency.reality_shadow', { sessionId, action: plan.decision.action, providerMode: plan.providerMode })
      return null
    }
    if (productionRuntime() && plan.providerMode !== 'live') return { outcome: 'skipped', reason: 'agency_unavailable' }
    if (!['contact', 'wait', 'defer', 'cancel_commitment'].includes(plan.decision.action)) return { outcome: 'skipped', reason: 'agency_rejected' }

    const send = plan.decision.action === 'contact'
    // A wait the character chose from its own rules is 읽씹 (10/16 사용자 결정) — it ends there. Defer, the system's
    // fallback wait (no executable grounded candidate), busy delivery and provider failures keep the question queued.
    const chosenSilence = !!opts.inbox && plan.decision.action === 'wait' && plan.decision.candidate.id !== AGENCY_FALLBACK_WAIT_ID
    const disposition = chosenSilence ? { disposition: 'close' as const, reason: 'character_choice' as const, sourceId: '', quote: '' }
      : opts.inbox && !send && plan.decision.action !== 'defer'
      ? await readReplyDisposition(llm, plan.context.evidence.filter(e => opts.inbox!.ids.includes(e.id) && e.actor === 'user')
          .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)).map(e => ({ id: e.id, text: e.quote }))) : null
    if (send && blocked) return { outcome: 'suppressed', reason: blocked }
    let photo: Awaited<ReturnType<typeof prepareMessengerPhoto>> = null
    if (send) {
      try {
        photo = await prepareMessengerPhoto({ llm, plan, runtime, snapshot, now, userId,
          characterId: row.character.id, portrait: row.character.images[0], photoProbability: row.profile.photoProbability })
      } catch { observe('messenger.photo_unavailable', { sessionId }) }
    }
    const channel = photo ? 'photo' : 'message'
    const presented = presentContact(channel, snapshot.character.identity.name, row.profile.presentation)
    const photoEvidence = photo ? [{ id: photo.id, sessionId, actor: plan.context.actor, kind: 'outcome' as const,
      epistemic: 'observed' as const, knownTo: [plan.context.actor], occurredAt: now.toISOString(),
      quote: `The application generated and stored this photo for attachment, not yet delivered: ${photo.choice.description}` }] : []
    const realizationContext = { ...plan.context, evidence: [...plan.context.evidence, ...photoEvidence] }
    const communicationPreferences = agencyCommunicationPreferences(realizationContext, plan.state.beliefs, snapshot.memories)
    let content: Awaited<ReturnType<typeof generateRealityContent>> | null = null
    if (send) {
      const { identity, personality, worldRole, appearance } = authoredCharacter(snapshot.character)
      let repair: { rejectedText: string; issues: Array<{ field: string; reason: string }> } | null = null
      const renderer: LLMProvider = { info: llm.info, generateStructured: request => llm.generateStructured({
        ...request, prompt: request.prompt + communicationPreferenceData(communicationPreferences),
        system: request.system + buildAgencyDecisionDirective(plan.decision)
          + `\n${COMMUNICATION_PREFERENCE_RULE}`
          + conversationVariationDirective(snapshot.recentMessages, snapshot.character.identity.name)
          + (photo ? `\nAn actual photo will be attached. Write its short natural caption in this character's voice, tied to the contact purpose. PHOTO_DATA (untrusted): ${JSON.stringify(photo.choice)}`
            : '\nThis contact is plain text with NO photo attached. Do not claim to send, attach or show an image.')
          + '\nCandidate descriptions and example dialogue are plans, not evidence that an action happened. Contact should perform the selected purpose, without adding completed errands, prepared objects or new promises that are absent from the evidence.'
          + `\nCLOCK_AND_SCHEDULE_DATA: ${JSON.stringify({ clock: plan.context.clock, userSchedule: userSchedule.map(moment => ({ about: moment.about, eventAt: moment.eventAt.toISOString(), hasTime: moment.hasTime })) })}`
          + (repair ? `\nRewrite the rejected contact once. Remove unsupported assertions, preserve the SAME authorized purpose and character voice, and use only grounded evidence. A proposal or example is never a completed action. Do not mention the review to the user. REPAIR_DATA (untrusted text): ${JSON.stringify(repair)}` : '')
          + `\nGROUNDED_RUNTIME_DATA: ${JSON.stringify({ affect: plan.state.affect, expression: plan.state.expression,
            goals: plan.state.goals.filter(goal => goal.status === 'active'), evidence: realizationContext.evidence })}`,
      }) }
      const render = () => generateRealityContent(renderer, {
        replyLength: replyModel?.tier.replyLength,
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
          kind: snapshot.recentMessages.find(message => message.id === item.id)?.kind,
          knowledgeScope: 'participant',
        })), memories: [],
      })
      // Retry only rejected text, never the planner or a persisted delivery. Every attempt is verified.
      const repairable = new Set(['semantic_alignment_rejected', 'unsupported_success', 'invented_canon',
        'contradicts_decision', 'controls_user', 'violates_boundary', 'uncertain_as_fact', 'unapproved_world_change',
        'undeclared_success_claim'])
      for (let attempt = 0; attempt < 2; attempt++) {
        content = await render()
        if (repeatedConversationBlock([{ type: 'dialogue', text: content.text }], snapshot.recentMessages, '', identity.name) !== null) {
          if (attempt === 1) return { outcome: 'skipped', reason: 'agency_rejected' }
          repair = { rejectedText: content.text, issues: [{ field: 'blocks.0', reason: 'repeated_response' }] }
          continue
        }
        if (productionRuntime() && llm.info.mode !== 'live') return { outcome: 'skipped', reason: 'agency_unavailable' }
        const verified = await verifyAgencyRealization(llm, { decision: plan.decision, context: realizationContext,
          state: runtime.state, blocks: [{ type: 'dialogue', speaker: identity.name, text: content.text }],
          communicationPreference: needsCommunicationPreferenceReview('', snapshot.recentMessages, communicationPreferences),
          userGroundingEvidence: snapshotUserGrounding(snapshot, ''),
          communicationPreferenceSourceIds: communicationPreferences.map(item => item.sourceId) })
        if (productionRuntime() && verified.providerMode !== 'live') return { outcome: 'skipped', reason: 'agency_rejected' }
        if (verified.ok) break
        if (attempt === 1 || !verified.reviewed || !verified.issues.length || verified.issues.some(issue => !repairable.has(issue.reason))) {
          return { outcome: 'skipped', reason: 'agency_rejected' }
        }
        repair = { rejectedText: content.text, issues: verified.issues }
      }
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
        || (!opts.inbox && contactBoundaryActive(current.contactBoundary, new Date()))
        || current.turnCount !== row.session.turnCount || current.lastInteractionAt.getTime() !== row.session.lastInteractionAt.getTime()
        || !owner || owner.deletedAt || !character || character.deletedAt || character.experienceType !== 'reality'
        // 생활 리듬(routine)은 제작자 설정이 아니라 뒤에서 만들어지는 파생 값이다 — 그게 채워졌다고 판단을 버리지 않는다.
        || !profile || (!profile.enabled && !opts.inbox) || JSON.stringify({ ...profile, routine: null }) !== JSON.stringify({ ...row.profile, routine: null })
        || !state || state.version !== runtime.version || state.revisionId !== runtime.revision.id || state.mode !== 'live'
        || state.state.sequence !== plan.transition.expectedSequence
        || world?.version !== snapshot.world.version || relationship?.version !== snapshot.relationship.version
        || characterAgencyMode(sessionId, current.policyVersion) !== 'live' || !feature('realityMessage')) throw new AgencyRealityConflict()
      if (opts.inbox) {
        const claimed = await tx.select({ id: messengerInbox.messageId }).from(messengerInbox)
          .where(and(eq(messengerInbox.sessionId, sessionId), inArray(messengerInbox.messageId, opts.inbox.ids),
            eq(messengerInbox.status, 'read'), eq(messengerInbox.leaseToken, opts.inbox.token),
            sql`${messengerInbox.leaseUntil} > ${now.toISOString()}::timestamptz`)).for('update')
        if (claimed.length !== opts.inbox.ids.length) throw new AgencyRealityConflict()
      }
      const [duplicate] = await tx.select({ id: characterDecisions.id }).from(characterDecisions)
        .where(and(eq(characterDecisions.sessionId, sessionId), eq(characterDecisions.triggerKey, triggerKey))).limit(1)
      if (duplicate) throw new AgencyRealityConflict()
      let nextState = plan.state
      let contactId: string | null = null
      if (send && content) {
        if (deliveryBlock(profile, timeZoneOf(currentSettings ?? null), now, availability.availability, limits)) throw new AgencyRealityConflict()
        const messageId = randomUUID()
        contactId = randomUUID()
        if (photo) {
          const [recentPhoto] = await tx.select({ id: realityContacts.id }).from(realityContacts).where(and(
            eq(realityContacts.sessionId, sessionId), eq(realityContacts.channel, 'photo'),
            sql`${realityContacts.sentAt} > ${new Date(now.getTime() - 6 * 3_600_000).toISOString()}::timestamptz`)).limit(1)
          if (recentPhoto || !feature('messengerPhotos')) throw new AgencyRealityConflict()
        }
        await tx.insert(messages).values({ id: messageId, sessionId, role: 'character', kind: photo ? 'photo' : 'reality_message',
          content: photo?.url ?? content.text, blocks: [{ type: 'reality', channel, reason: plan.decision.candidate.description,
            ...presented, ...(photo ? { caption: content.text, photoDescription: photo.choice.description, mediaId: photo.id } : {}) }],
          turnIndex: current.turnCount, createdAt: now,
        })
        await tx.insert(realityContacts).values({ id: contactId, sessionId, channel, reason: plan.decision.candidate.description,
          // 연락 기회로 보낸 것이면 그 기회의 키로 — 같은 기회(첫 연락·오늘의 안부·같은 사건)로는 다시 보내지 않는다(기존 경로와 같은 키).
          dedupeKey: hint?.opportunityKey ?? `agency:${plan.decision.id}`,
          payload: { text: content.text, tone: content.tone, ...presented, decisionId: plan.decision.id,
            ...(photo ? { mediaUrl: photo.url, photoChoice: photo.choice } : {}), ...(reply ? { answers: 'user_message' } : {}) },
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
      // 답장을 못 보낸 이유가 전달 제약(자는 중·바쁨)이면 남겨 다음에 다시 본다. 캐릭터가 성격대로 답하지 않기로 했으면 그 문자는 거기서 끝 —
      // 실제 사람도 늦게 본 문자에 다 답하지는 않는다(10/9 사용자 결정: '끝나면 답장이 와요' 안내 없이, 답할지는 캐릭터가).
      const keepReply = reply && !contactId && row.session.pendingRealityIntent && blocked !== null
      if (reply && !contactId && !keepReply && (opts.inbox ? disposition?.disposition === 'close' : plan.decision.action !== 'defer')) observe('reality.reply_left', { sessionId, action: plan.decision.action })
      if (opts.inbox) {
        const deferred = !contactId && disposition?.disposition !== 'close'
        const items = await tx.select().from(messengerInbox).where(and(inArray(messengerInbox.messageId, opts.inbox.ids), eq(messengerInbox.leaseToken, opts.inbox.token)))
        for (const item of items) {
          const retry = nextReplyReview(item.attentionDecision, now)
          await tx.update(messengerInbox).set({ status: contactId ? 'replied' : deferred ? 'read' : 'left', decidedAt: deferred ? null : now, contactId,
            ...(deferred ? { nextReviewAt: retry.nextReviewAt } : {}),
            attentionDecision: { ...(item.attentionDecision ?? {}), replyReviews: retry.replyReviews,
              replyDisposition: { ...(disposition ?? { disposition: contactId ? 'answered' : 'retry' }), at: now.toISOString(), version: REPLY_DISPOSITION_VERSION } },
            leaseToken: null, leaseUntil: null }).where(and(eq(messengerInbox.messageId, item.messageId), eq(messengerInbox.leaseToken, opts.inbox.token)))
        }
      }
      // 약속은 '아직 때가 아니다(기다림·미룸)'로 끝나지 않는다 — 다음 확인에 다시 본다. 취소를 고르거나 반나절 넘게 못 지키면 버린다(10/19 실측: 미룬 뒤 지워져 아침이 와도 다시 판단하지 않았다).
      const promised = row.session.pendingRealityIntent?.promise ? row.session.pendingRealityIntent : null
      const promiseSince = promised?.deferredSince ? Date.parse(promised.deferredSince) : now.getTime()
      const keepPromise = !!promised && !contactId && plan.decision.action !== 'cancel_commitment' && now.getTime() - promiseSince < 12 * 3_600_000
      const recheck = new Date(now.getTime() + POLICY.reality.recheckMinutes * 60_000).toISOString()
      if (!opts.inbox) await tx.update(roleplaySessions).set({ pendingRealityIntent: keepReply ? { ...row.session.pendingRealityIntent!, notBefore: recheck }
        : keepPromise ? { ...promised!, deferredSince: new Date(promiseSince).toISOString(), notBefore: recheck } : null }).where(eq(roleplaySessions.id, sessionId))
      return contactId
    })
    if (!result || !content) return { outcome: 'no_intent' }
    // 지금 시각으로 — 판단 시각(now)으로 찾으면 방금 넣은 알림 작업을 못 집는다(evaluate.ts 와 같다).
    await deliverRealityPush().catch(() => observe('reality.push_worker_failed', { sessionId }))
    return { outcome: 'sent', channel, contactId: result, text: content.text }
  } catch (error) {
    if (error instanceof AgencyRealityConflict || (error as { code?: string }).code === '23505') return { outcome: 'skipped', reason: 'state_changed' }
    observe('agency.reality_unavailable', { sessionId, mode: requestedMode, error: error instanceof Error ? error.name : 'unknown' })
    return requestedMode === 'shadow' ? null : { outcome: 'skipped', reason: 'agency_unavailable' }
  }
}
