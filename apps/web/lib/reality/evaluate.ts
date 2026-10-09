import { localClock } from '@miro/domain'
import { and, desc, eq, inArray, isNull, like } from 'drizzle-orm'
import { POLICY, feature, features } from '@miro/config'
import {
  db, characterDecisions, characters, contactProfiles, events, messages, pushSubscriptions,
  realityContacts, relationships, roleplaySessions, stateTransitions, userSettings, worldStates, users,
} from '@miro/db'
import {
  DEFAULT_CHARACTER_STATE, contactDedupeKey, dailyContactCap, deriveIntent, describeRelationship, evaluateEventRules, evaluateRealityContact, localDay, localMinutes,
  momentIntent, parseRelationshipProfile, presentContact,
} from '@miro/domain'
import type { CharacterState, ContactChannel, RealityContact, RealityDecision, SuppressReason } from '@miro/domain'
import { buildMockRealityContent, createAI, generateRealityContent, resolvePush } from '@miro/providers'
import { installAIUsageSink } from '@/lib/usage/ai-usage'
import { getOrGenerate } from '@/lib/simulation/media'
import { startIncomingCall } from '@/lib/call/service'
import { track } from '@/lib/analytics/track'
import { observe } from '@/lib/observe'
import { enqueueRealityPush, deliverRealityPush } from './push-outbox'
import { deliverableChannel } from './channels'
import { loadRealityContext } from './context'
import { shouldChargeRealityContact } from '@miro/domain'
import { evaluateAgencyReality } from './agency'
import { characterAvailability } from './routine'
import { dueMomentFor, settleMoment, type DueMoment } from './moments'
import { msg } from '@/lib/i18n'
import { translateTo } from '@/lib/i18n/server'

export type EvaluateOutcome =
  | { outcome: 'sent'; channel: ContactChannel; contactId: string; text?: string }
  | { outcome: 'suppressed'; reason: SuppressReason }
  /** 사건 규칙이 발동했지만 delay 가 있어 예약만 했다. 스케줄러가 notBefore 뒤에 다시 판단한다. */
  | { outcome: 'scheduled'; ruleId: string; notBefore: string }
  | { outcome: 'no_intent' }
  | { outcome: 'skipped'; reason: 'session_not_found' | 'duplicate' | 'feature_disabled' | 'state_changed' | 'not_reality' | 'contact_disabled' | 'agency_unavailable' | 'agency_rejected' }

/**
 * 한 세션에 대한 선연락 판단과 발송.
 *
 * 스케줄러는 "지금 판단해볼 시점인가" 만 정한다. 실제로 연락할지는
 * 이 함수가 현재 상태(관계·사건·성향·설정·시각)로 결정한다.
 * 가입 후 경과 시간 같은 값은 입력에 없다.
 */
export async function evaluateSession(
  sessionId: string, now = new Date(),
  /** inline: 턴 직후 즉시 발송(사건 규칙이 '지금' 이라 정했다). 활동 시간·쿨다운 같은 스케줄 판정은 건너뛴다. */
  opts: { inline?: boolean; background?: boolean } = {},
): Promise<EvaluateOutcome> {
  if (!feature('realityMessage')) return { outcome: 'skipped', reason: 'feature_disabled' }
  // 사용자가 말한 일정(응원·"어땠어?")이 챙길 때가 됐으면 이번 판단의 연락 기회가 된다(10/9). 쓰였으면 결과를 남긴다.
  const moment = { due: opts.inline ? null : await dueMomentFor(sessionId, now), used: false }
  const outcome = await evaluateWith(sessionId, now, opts, moment)
  if (moment.due && moment.used) await settleMoment(moment.due, outcome, now).catch(e => observe('moment.settle_failed', { sessionId, error: (e as Error).message }))
  return outcome
}

async function evaluateWith(sessionId: string, now: Date, opts: { inline?: boolean; background?: boolean }, moment: { due: DueMoment | null; used: boolean }): Promise<EvaluateOutcome> {
  const rows = await db
    .select({
      session: roleplaySessions, character: characters, world: worldStates,
      relationship: relationships, profile: contactProfiles, settings: userSettings,
    })
    .from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .innerJoin(worldStates, eq(worldStates.sessionId, roleplaySessions.id))
    .innerJoin(relationships, eq(relationships.sessionId, roleplaySessions.id))
    .innerJoin(contactProfiles, eq(contactProfiles.characterId, characters.id))
    .leftJoin(userSettings, eq(userSettings.userId, roleplaySessions.userId))
    .where(and(eq(roleplaySessions.id, sessionId), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt)))
    .limit(1)

  const row = rows[0]
  if (!row) return { outcome: 'skipped', reason: 'session_not_found' }
  // 스케줄러·inline·큐 어느 쪽으로 왔든 마지막에 한 번 더 본다. 유형이 바뀐 뒤 남은 의도는 여기서 지운다 —
  // 두면 스케줄러가 매 주기 다시 집어 든다.
  if (row.character.experienceType !== 'reality') {
    if (row.session.pendingRealityIntent) await db.update(roleplaySessions).set({ pendingRealityIntent: null }).where(eq(roleplaySessions.id, sessionId))
    return { outcome: 'skipped', reason: 'not_reality' }
  }

  if (!row.profile.enabled) {
    if (row.session.pendingRealityIntent) await db.update(roleplaySessions).set({ pendingRealityIntent: null }).where(eq(roleplaySessions.id, sessionId))
    return { outcome: 'skipped', reason: 'contact_disabled' }
  }

  const sentStatus = inArray(realityContacts.status, ['sent', 'opened'])
  const [activeEvents, sent, eventContacts, lastUser, firstContactDecided] = await Promise.all([
    db.select().from(events).where(and(eq(events.sessionId, sessionId), inArray(events.status, ['active', 'escalated']))),
    // 실제로 보낸 연락만 본다 — 막힌 기록까지 최근 10줄에 섞으면 하룻밤 사이 보낸 연락이 밀려나 대기 시간·안 읽은 연락 상한이 풀렸다(10/2 감사).
    db.select({ status: realityContacts.status, sentAt: realityContacts.sentAt, payload: realityContacts.payload }).from(realityContacts)
      .where(and(eq(realityContacts.sessionId, sessionId), sentStatus))
      .orderBy(desc(realityContacts.sentAt)).limit(20),
    // 이미 연락한 사건 — 같은 사건·상태로는 다시 연락하지 않고 다른 이유를 본다.
    db.select({ key: realityContacts.dedupeKey }).from(realityContacts)
      .where(and(eq(realityContacts.sessionId, sessionId), sentStatus, like(realityContacts.dedupeKey, '%event%'))),
    // 사용자가 마지막으로 말한 곳 — 만나서(text) 였는지 문자(messenger) 였는지. '잘 들어갔어?' 는 만난 뒤에만.
    db.select({ kind: messages.kind }).from(messages).where(and(eq(messages.sessionId, sessionId), eq(messages.role, 'user')))
      .orderBy(desc(messages.createdAt)).limit(1),
    // 첫 연락 기회는 세션에 한 번 — 자율성 경로가 이미 판단했으면(보내지 않기로 했어도) 다시 내밀지 않는다. 다시 내밀면 같은 키라 매번 '중복'으로 막혀
    // 침묵·식사 안부 같은 다른 이유가 영영 생기지 않았다(10/2 실측: 첫 연락을 기다리기로 한 뒤 50시간 동안 아무 판단도 없었다).
    db.select({ id: characterDecisions.id }).from(characterDecisions)
      .where(and(eq(characterDecisions.sessionId, sessionId), like(characterDecisions.triggerKey, 'reality:opportunity:%:first_contact'))).limit(1),
  ])

  const profile = {
    id: row.profile.id, characterId: row.character.id,
    enabled: row.profile.enabled,
    contactFrequency: row.profile.contactFrequency,
    replyDelayMinutes: row.profile.replyDelayMinutes,
    preferredChannel: row.profile.preferredChannel as ContactChannel,
    callProbability: row.profile.callProbability / 100,
    videoCallProbability: row.profile.videoCallProbability / 100,
    photoProbability: row.profile.photoProbability / 100,
    voiceMessageProbability: row.profile.voiceMessageProbability / 100,
    activeHours: { start: row.profile.activeHoursStart, end: row.profile.activeHoursEnd },
    initiativeLevel: row.profile.initiativeLevel,
  }

  const idleMinutes = (now.getTime() - row.session.lastInteractionAt.getTime()) / 60_000
  const characterState: CharacterState = { ...DEFAULT_CHARACTER_STATE, ...(row.session.characterState as Partial<CharacterState>) }
  const saved = (row.session.pendingRealityIntent as RealityIntentRow | null) ?? null
  let pending = saved
  // 앱 밖 연락은 사용자가 끌 수 없다 (2026-09-24 결정). 시간대만 읽어 캐릭터의 활동 시간·하루를 사용자 현지 시각으로 본다.
  const timeZone = row.settings?.timeZone ?? POLICY.reality.defaultTimeZone
  const today = localDay(now, timeZone)

  // Event Engine(유휴 시간 규칙) — 스케줄러는 "다시 볼 시점인가" 만 묻고, 무슨 일이 일어날지는 규칙이 정한다.
  if (!pending && !opts.inline && feature('eventEngine')) {
    const sceneMarker = `after_scene:${row.session.lastInteractionAt.toISOString()}`
    const fired = evaluateEventRules({ relationship: row.relationship as never, characterState, semanticEvents: [], idleMinutes, turnCount: row.session.turnCount,
      lastUserChannel: lastUser[0]?.kind === 'messenger' ? 'messenger' : lastUser[0] ? 'scene' : undefined,
      sceneFollowUpSent: characterState.firedRules.includes(sceneMarker), profile: parseRelationshipProfile(row.character.relationshipProfile), today })
    const rule = fired.find((r) => r.effect.realityIntent)
    if (rule?.effect.realityIntent) {
      const { channel, reason, urgency, delayMinutes } = rule.effect.realityIntent
      // after_scene 은 장면(마지막 상호작용)마다 한 번 — 표시는 가장 최근 것 하나만 남긴다. 하루 한 번 규칙은 오늘 날짜 표시 하나만 남긴다.
      const nextState = rule.id === 'after_scene'
        ? { ...characterState, firedRules: [...characterState.firedRules.filter((f) => !f.startsWith('after_scene:')), sceneMarker] }
        : rule.daily ? { ...characterState, firedRules: [...characterState.firedRules.filter((f) => !f.startsWith(`${rule.id}:`)), `${rule.id}:${today}`] }
        : rule.once ? { ...characterState, firedRules: [...characterState.firedRules, rule.id] } : characterState
      if (delayMinutes > 0) {
        const notBefore = new Date(now.getTime() + delayMinutes * 60_000).toISOString()
        await db.update(roleplaySessions).set({ pendingRealityIntent: { channel, reason, urgency, notBefore, rule: rule.id }, characterState: nextState })
          .where(eq(roleplaySessions.id, sessionId))
        return { outcome: 'scheduled', ruleId: rule.id, notBefore }
      }
      pending = { channel, reason, urgency, rule: rule.id }
      if (nextState !== characterState) await db.update(roleplaySessions).set({ characterState: nextState }).where(eq(roleplaySessions.id, sessionId))
    }
  }

  // 생활 리듬 — 자는 중이면 아무것도 안 나가고, 바쁘면 급한 것만, 비어 있으면 식사 시간 안부도 생긴다.
  const availability = await characterAvailability(row.character.id, now, timeZone, { wait: true })
  const lastSent = sent[0]
  // 사용자가 아직 답하지 않은 연락 = 마지막 상호작용 뒤에 보낸 것. 문자 화면을 열어야만 읽음이 되면, 장면 채팅으로만 답하는 사용자에게는 영영 쌓여 막혔다.
  const unanswered = sent.filter((c) => c.status === 'sent' && c.sentAt && c.sentAt > row.session.lastInteractionAt)
  // 오늘(사용자 현지 날짜) 먼저 보낸 연락 — 답장은 세지 않는다.
  const localMidnight = new Date(now.getTime() - localMinutes(now, timeZone) * 60_000 - (now.getUTCSeconds() * 1000 + now.getUTCMilliseconds()))
  const contactsToday = sent.filter((c) => c.sentAt && c.sentAt >= localMidnight && (c.payload as { answers?: string } | null)?.answers !== 'user_message').length
  const contactedEvents = contactedEventKeys(eventContacts.map((c) => c.key))

  const derived = deriveIntent({
    relationship: row.relationship as never,
    activeEvents: activeEvents as never,
    contactProfile: profile,
    idleMinutes,
    pending: pending as never,
    now,
    clock: localClock(now, timeZone), availability: availability.availability, lastContactAt: lastSent?.sentAt ?? null,
    contactedEvents, turnCount: row.session.turnCount, contactedBefore: sent.length > 0 || firstContactDecided.length > 0, initiative: row.character.initiative,
  })
  // 사용자 일정이 다른 이유보다 먼저다 — 그때를 놓치면 뜻이 없다. 사용자 문자에 대한 답장만 그보다 앞선다(답장은 사라지면 안 된다).
  // 기다리는 답장(아직 시각 전인 것 포함)이 있으면 일정은 다음 확인으로 — 보내는 쪽이 대기 의도를 비워 답장이 사라지지 않게.
  const intent = moment.due && !saved?.answers && derived?.answers !== 'user_message' ? momentIntent(moment.due.moment, moment.due.phase, timeZone) : derived
  moment.used = !!intent?.momentKey
  const dailyCap = dailyContactCap(row.relationship as never, row.character.initiative, profile)

  // 자율성 경로가 켜진 세션은 같은 연락 기회를 엔진(계획)에 판단 재료로 넘긴다 — 보낼지·무엇을 말할지는 캐릭터가 정한다(2026-10-02).
  // 꺼져 있거나(off) 판이 아직 준비되지 않았으면 null 이고 아래 기존 경로가 그대로 맡는다.
  // 기존 사건(events)은 넘기지 않는다 — 자율성 경로에서 사건은 관측 근거가 없는 옛 기록이라 연락 근거가 되지 않는다(loadAgencyEvidence).
  const opportunity = intent?.eventKey ? null : intent
  const agency = await evaluateAgencyReality(row, now, opts, { opportunity, opportunityKey: opportunity ? contactDedupeKey(opportunity, now, timeZone) : null, contactsToday, dailyCap })
  if (agency) return agency
  if (!intent) return { outcome: 'no_intent' }

  let decision: RealityDecision = opts.inline
    ? { send: true, channel: intent.channel, dedupeKey: `inline:${row.session.turnCount}:${intent.reason}` }
    : evaluateRealityContact({
    intent,
    contactProfile: profile,
    personality: {
      initiative: row.character.initiative,
      emotionalExpression: row.character.emotionalExpression,
    },
    relationship: row.relationship as never,
    activeEvents: activeEvents as never,
    timeZone,
    lastContactAt: lastSent?.sentAt ?? null,
    pendingContacts: unanswered as unknown as RealityContact[],
    now,
    availability: availability.availability,
    contactsToday,
    dailyCap,
  })

  if (!decision.send) {
    // 같은 의도가 같은 이유로 막힌 기록은 하루 한 줄 — 전엔 30분마다 한 줄씩, 세션 하나에 하루 48줄이 쌓였다.
    await db.insert(realityContacts).values({
      sessionId, channel: intent.channel, reason: intent.reason,
      dedupeKey: `suppressed:${today}:${decision.reason}:${intent.reason}`,
      status: 'suppressed', suppressedReason: decision.reason,
    }).onConflictDoNothing()
    // 저장된 예약 의도가 막혔을 때. 답장은 끝까지 미뤘다 보낸다 — 사용자 문자가 답을 못 받으면 안 된다.
    // 그 밖의 의도는 동기가 없거나 반나절 넘게 막히면 버린다 — 남겨 두면 다른 연락(침묵·식사 안부)을 모두 가로막았다(9/27~30 운영, 10/2 감사).
    if (saved && pending === saved) {
      const since = saved.deferredSince ? new Date(saved.deferredSince) : now
      const stale = now.getTime() - since.getTime() > STALE_INTENT_HOURS * 3_600_000
      const drop = !saved.answers && (decision.reason === 'no_motivation' || stale)
      await db.update(roleplaySessions)
        .set({ pendingRealityIntent: drop ? null : { ...saved, deferredSince: since.toISOString(), notBefore: new Date(now.getTime() + POLICY.reality.recheckMinutes * 60_000).toISOString() } })
        .where(eq(roleplaySessions.id, sessionId))
      if (drop) observe('reality.intent_dropped', { sessionId, reason: decision.reason, stale })
    }
    return { outcome: 'suppressed', reason: decision.reason }
  }
  // 기능 플래그 — 알파에서는 사진·통화가 꺼져 있다. 채널만 낮추고 연락 자체는 보낸다.
  decision = { ...decision, channel: deliverableChannel(decision.channel, features()) }

  // 같은 사유가 이미 나갔으면 통화를 울리거나 본문을 만들기 전에 멈춘다 — 모델을 부른 뒤 중복 키로 버리는 일(비용)을 없앤다.
  // 예약된 의도가 중복이면 지운다 — 남겨 두면 스케줄러가 매 주기 다시 집어 든다.
  const [dupe] = await db.select({ id: realityContacts.id }).from(realityContacts)
    .where(and(eq(realityContacts.sessionId, sessionId), eq(realityContacts.dedupeKey, decision.dedupeKey))).limit(1)
  if (dupe) {
    if (pending) await db.update(roleplaySessions).set({ pendingRealityIntent: null }).where(eq(roleplaySessions.id, sessionId))
    observe('reality.duplicate_prevented', { sessionId, channel: decision.channel })
    return { outcome: 'skipped', reason: 'duplicate' }
  }

  const presented = presentContact(decision.channel, row.character.name, row.profile.presentation)

  // ---- 통화: 메시지가 아니라 ringing 통화 세션을 만든다. 수락 전까지 사용량은 없다. ----
  if (decision.channel === 'voice_call' || decision.channel === 'video_call') {
    const channel = decision.channel === 'voice_call' ? 'voice' : 'video'
    const callId = await startIncomingCall(sessionId, channel, intent.reason)
    if (!callId) { observe('reality.duplicate_prevented', { sessionId, channel: decision.channel }); return { outcome: 'skipped', reason: 'duplicate' } }
    let contactId: string
    try {
      const [c] = await db.insert(realityContacts).values({
        sessionId, channel: decision.channel, reason: intent.reason, dedupeKey: decision.dedupeKey,
        payload: { callId, ...presented }, status: 'sent', sentAt: now,
      }).returning({ id: realityContacts.id })
      contactId = c!.id
      await db.update(roleplaySessions).set({ pendingRealityIntent: null }).where(eq(roleplaySessions.id, sessionId))
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return { outcome: 'skipped', reason: 'duplicate' }
      throw e
    }
    const [settings] = await db.select({ language: userSettings.language }).from(userSettings).where(eq(userSettings.userId, row.session.userId)).limit(1)
    await pushToUser(row.session.userId, {
      title: presented.senderLabel,
      body: translateTo(settings?.language, channel === 'video' ? msg('영상통화 수신') : msg('전화 수신')),
      url: `/messages/${sessionId}`, tag: `call:${sessionId}`,
    })
    void track(row.session.userId, 'reality_contact_sent', { sessionId, channel: decision.channel, reason: intent.reason })
    return { outcome: 'sent', channel: decision.channel, contactId }
  }

  // ---- 내용 생성 (Provider 미구성 시 Mock, 숨기지 않음) ----
  installAIUsageSink()
  const llm = createAI({ mock: (req) => buildMockRealityContent(req.prompt), context: { userId: row.session.userId, sessionId, workload: opts.background ? 'background' : 'interactive', origin: 'reality:legacy:reality:miro:background', adult: row.session.adultSince !== null } })

  const grounding = await loadRealityContext(sessionId, row.session.userId, intent.reason)
  if (!grounding) return { outcome: 'skipped', reason: 'session_not_found' }
  const contentInput = {
    characterName: row.character.name,
    personality: row.character.personality,
    speechStyle: row.character.speechStyle,
    channelLabel: presented.channelLabel,
    reason: intent.reason,
    worldLocation: row.world.currentLocation,
    worldStatus: row.world.worldStatus,
    relationshipHint: describeRelationship(row.relationship as never),
    activeEventSummary: activeEvents[0]
      ? String((activeEvents[0].continuationState as { summary?: string }).summary ?? activeEvents[0].type)
      : null,
    // 현지 시각과 하루의 때 — 캐릭터가 '저녁 먹었어?' 를 저녁에 보내려면 지금이 저녁인지 알아야 한다.
    currentTime: `${localClock(now, timeZone).label} (${localClock(now, timeZone).period})`,
    ...grounding,
  }
  const content = await generateRealityContent(llm, contentInput)

  // Network inference finishes before acquiring the persistence transaction.
  let mediaUrl: string | null = null
  if (decision.channel === 'photo') {
    const media = await getOrGenerate({
      sessionId, characterId: row.character.id, characterName: row.character.name,
      kind: 'photo',
      context: {
        location: row.world.currentLocation, time: row.world.currentTime,
        mood: row.world.worldStatus ?? 'neutral', outfit: '', visualVersion: 0,
      },
      // 단순 선연락은 무차감 우선 (명세서 정책 1). 정책값으로 제어한다.
      usage: shouldChargeRealityContact() ? { userId: row.session.userId } : null,
    })
    mediaUrl = media.url
  }

  // ---- 발송: 메시지 + 기록 + Push, 한 트랜잭션 ----
  let contactId: string
  try {
    contactId = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)).for('update')
      const [owner] = await tx.select().from(users).where(eq(users.id, row.session.userId)).limit(1)
      const [profile] = await tx.select().from(contactProfiles).where(eq(contactProfiles.characterId, row.character.id)).limit(1).for('share')
      const [character] = await tx.select({ experienceType: characters.experienceType, deletedAt: characters.deletedAt }).from(characters).where(eq(characters.id, row.character.id)).limit(1)
      if (!character || character.experienceType !== 'reality' || character.deletedAt || !current || current.deletedAt || current.restrictedAt || current.status !== 'active' || !owner || owner.deletedAt || !profile?.enabled
        || current.lastInteractionAt.getTime() !== row.session.lastInteractionAt.getTime()
        || current.turnCount !== row.session.turnCount) throw new RealityStateChangedError()
      if (decision.channel === 'status') {
        await tx.update(roleplaySessions).set({ characterStatus: content.text })
          .where(eq(roleplaySessions.id, sessionId))
      }

      const [msg] = decision.channel === 'status' ? [null] : await tx.insert(messages).values({
        sessionId, role: 'character',
        kind: decision.channel === 'photo' ? 'photo' : 'reality_message',
        content: mediaUrl ?? content.text,
        blocks: [{
          type: 'reality', channel: decision.channel, reason: intent.reason,
          senderLabel: presented.senderLabel, channelLabel: presented.channelLabel,
          caption: mediaUrl ? content.text : null,
        }],
        turnIndex: row.session.turnCount,
      }).returning({ id: messages.id })

      const [contact] = await tx.insert(realityContacts).values({
        sessionId, channel: decision.channel, reason: intent.reason,
        dedupeKey: decision.dedupeKey,
        // answers: 답장이면 하루 상한에서 뺀다.
        payload: { text: content.text, tone: content.tone, mediaUrl, ...presented, ...(intent.answers ? { answers: intent.answers } : {}) },
        status: 'sent', sentAt: now, messageId: msg?.id ?? null,
      }).returning({ id: realityContacts.id })

      // 의도는 소비되었다. 다음 턴이나 다음 스케줄에서 다시 계산한다.
      await tx.update(roleplaySessions).set({ pendingRealityIntent: null })
        .where(eq(roleplaySessions.id, sessionId))

      await enqueueRealityPush(tx, contact!.id, row.session.userId)
      // 원장(§3.4): legacy 선연락도 같은 원장에. 큐 등록까지가 사실이다.
      await tx.insert(stateTransitions).values({ sessionId, triggerKey: `reality:${decision.dedupeKey}`, seq: 0, policyVersion: 'turn-policy:v1', engine: 'legacy',
        actor: row.character.id, field: `contact.${decision.channel}`, after: 'queued', rule: 'contact_dispatched', status: 'applied', clock: 'real',
        worldVersion: row.world.version, relationshipVersion: row.relationship.version, outcomeRef: contact!.id }).onConflictDoNothing()
      return contact!.id
    })
  } catch (e) {
    if (e instanceof RealityStateChangedError) return { outcome: 'skipped', reason: 'state_changed' }
    // (session_id, dedupe_key) UNIQUE — 같은 사유가 이미 발송됐다. 조용히 넘기되 기록한다.
    if ((e as { code?: string }).code === '23505') {
      // 트랜잭션이 되돌려 의도가 남았다 — 지우지 않으면 다음 주기에 다시 만든다.
      if (pending) await db.update(roleplaySessions).set({ pendingRealityIntent: null }).where(eq(roleplaySessions.id, sessionId)).catch(() => undefined)
      observe('reality.duplicate_prevented', { sessionId, channel: decision.channel }); return { outcome: 'skipped', reason: 'duplicate' }
    }
    throw e
  }
  void track(row.session.userId, 'reality_contact_sent', { sessionId, channel: decision.channel, reason: intent.reason })

  // A failed delivery remains queued without regenerating the message.
  // 판단 시각(now)이 아니라 지금 — 방금 넣은 알림 작업의 시각은 AI 생성 뒤라, now 로 찾으면 못 집고 다음 크론(최대 15분)까지 늦었다.
  await deliverRealityPush().catch(() => observe('reality.push_worker_failed', { sessionId }))

  return { outcome: 'sent', channel: decision.channel, contactId, text: content.text }
}

class RealityStateChangedError extends Error {}

type RealityIntentRow = { channel: ContactChannel; reason: string; urgency: number; notBefore?: string; answers?: 'user_message' | 'call'; rule?: string; deferredSince?: string; failures?: number }

/** 답장이 아닌 예약 의도를 이 시간 넘게 막히면 버린다. */
const STALE_INTENT_HOURS = 12

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
/**
 * 이미 연락한 사건(`id:status`). 지금 키는 `채널:event:id:status:사유`, 예전 키(10/2 이전)는 `채널:id1,id2:event:유형` — 예전 키의 사건은 active 로 연락한 것으로 본다.
 */
export function contactedEventKeys(keys: string[]): Set<string> {
  const out = new Set<string>()
  for (const key of keys) {
    const current = /:event:([0-9a-f-]{36}):(active|escalated):/i.exec(key)
    if (current) { out.add(`${current[1]!.toLowerCase()}:${current[2]}`); continue }
    if (key.includes(':event:')) for (const id of key.match(UUID) ?? []) out.add(`${id.toLowerCase()}:active`)
  }
  return out
}

async function pushToUser(userId: string, payload: {
  title: string; body: string; url: string; tag: string
}): Promise<void> {
  const [owner] = await db.select({ deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId)).limit(1)
  if (!owner || owner.deletedAt) return
  const subs = await db.select().from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.failedAt)))
  if (subs.length === 0) return

  const push = resolvePush()
  for (const s of subs) {
    const r = await push.send({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload)
    if (!r.ok) {
      observe('push.send_failed', { userId, gone: r.gone, error: r.error })
      if (r.gone) {
        await db.update(pushSubscriptions).set({ failedAt: new Date() })
          .where(eq(pushSubscriptions.id, s.id))
      }
    }
  }
}
