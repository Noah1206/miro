import { and, desc, eq, isNull } from 'drizzle-orm'
import { POLICY, feature } from '@miro/config'
import {
  db, characters, contactProfiles, events, messages, pushSubscriptions,
  realityContacts, relationships, roleplaySessions, userSettings, worldStates,
} from '@miro/db'
import {
  DEFAULT_CHARACTER_STATE, deriveIntent, describeRelationship, evaluateEventRules, evaluateRealityContact, presentContact,
} from '@miro/domain'
import type { CharacterState, ContactChannel, RealityContact, RealityDecision, SuppressReason } from '@miro/domain'
import { buildMockRealityContent, createAI, generateRealityContent, resolvePush } from '@miro/providers'
import { installAIUsageSink } from '@/lib/usage/ai-usage'
import { getOrGenerate } from '@/lib/simulation/media'
import { startIncomingCall } from '@/lib/call/service'
import { track } from '@/lib/analytics/track'
import { observe } from '@/lib/observe'
import { shouldChargeRealityContact } from '@miro/domain'

export type EvaluateOutcome =
  | { outcome: 'sent'; channel: ContactChannel; contactId: string; text?: string }
  | { outcome: 'suppressed'; reason: SuppressReason }
  /** 사건 규칙이 발동했지만 delay 가 있어 예약만 했다. 스케줄러가 notBefore 뒤에 다시 판단한다. */
  | { outcome: 'scheduled'; ruleId: string; notBefore: string }
  | { outcome: 'no_intent' }
  | { outcome: 'skipped'; reason: 'session_not_found' | 'duplicate' }

/**
 * 한 세션에 대한 선연락 판단과 발송.
 *
 * 스케줄러는 "지금 판단해볼 시점인가" 만 정한다. 실제로 연락할지는
 * 이 함수가 현재 상태(관계·사건·성향·설정·시각)로 결정한다.
 * 가입 후 경과 시간 같은 값은 입력에 없다.
 */
export async function evaluateSession(
  sessionId: string, now = new Date(),
  /** inline: 턴 직후 즉시 발송(사건 규칙이 '지금' 이라 정했다). 조용한 시간·쿨다운 같은 스케줄 판정은 건너뛴다. */
  opts: { inline?: boolean } = {},
): Promise<EvaluateOutcome> {
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
    .where(and(eq(roleplaySessions.id, sessionId), isNull(roleplaySessions.deletedAt)))
    .limit(1)

  const row = rows[0]
  if (!row) return { outcome: 'skipped', reason: 'session_not_found' }

  const [activeEvents, recent] = await Promise.all([
    db.select().from(events).where(and(eq(events.sessionId, sessionId), eq(events.status, 'active'))),
    db.select().from(realityContacts)
      .where(eq(realityContacts.sessionId, sessionId))
      .orderBy(desc(realityContacts.createdAt)).limit(10),
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
  let pending = (row.session.pendingRealityIntent as RealityIntentRow | null) ?? null

  // Event Engine(유휴 시간 규칙) — 스케줄러는 "다시 볼 시점인가" 만 묻고, 무슨 일이 일어날지는 규칙이 정한다.
  if (!pending && !opts.inline && feature('eventEngine')) {
    const fired = evaluateEventRules({ relationship: row.relationship as never, characterState, semanticEvents: [], idleMinutes, turnCount: row.session.turnCount })
    const rule = fired.find((r) => r.effect.realityIntent)
    if (rule?.effect.realityIntent) {
      const { channel, reason, urgency, delayMinutes } = rule.effect.realityIntent
      const nextState = rule.once ? { ...characterState, firedRules: [...characterState.firedRules, rule.id] } : characterState
      if (delayMinutes > 0) {
        const notBefore = new Date(now.getTime() + delayMinutes * 60_000).toISOString()
        await db.update(roleplaySessions).set({ pendingRealityIntent: { channel, reason, urgency, notBefore }, characterState: nextState })
          .where(eq(roleplaySessions.id, sessionId))
        return { outcome: 'scheduled', ruleId: rule.id, notBefore }
      }
      pending = { channel, reason, urgency }
      if (rule.once) await db.update(roleplaySessions).set({ characterState: nextState }).where(eq(roleplaySessions.id, sessionId))
    }
  }

  const intent = deriveIntent({
    relationship: row.relationship as never,
    activeEvents: activeEvents as never,
    contactProfile: profile,
    idleMinutes,
    pending: pending as never,
    now,
  })
  if (!intent) return { outcome: 'no_intent' }

  const settings = {
    pushEnabled: row.settings?.pushEnabled ?? true,
    voiceCallEnabled: row.settings?.voiceCallEnabled ?? true,
    videoCallEnabled: row.settings?.videoCallEnabled ?? true,
    quietHoursEnabled: row.settings?.quietHoursEnabled ?? POLICY.quietHours.defaultEnabled,
    quietHoursStart: row.settings?.quietHoursStart ?? POLICY.quietHours.defaultStart,
    quietHoursEnd: row.settings?.quietHoursEnd ?? POLICY.quietHours.defaultEnd,
    timeZone: row.settings?.timeZone ?? POLICY.reality.defaultTimeZone,
  }

  const lastSent = recent.find((c) => c.status === 'sent' || c.status === 'opened')
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
    settings,
    lastContactAt: lastSent?.sentAt ?? null,
    pendingContacts: recent.filter((c) => c.status === 'sent') as unknown as RealityContact[],
    now,
  })

  if (!decision.send) {
    await db.insert(realityContacts).values({
      sessionId, channel: intent.channel, reason: intent.reason,
      dedupeKey: `suppressed:${now.toISOString()}`,
      status: 'suppressed', suppressedReason: decision.reason,
    })
    // 예약된 의도가 막혔으면 다음 재판단 시점으로 미룬다 — 매 틱마다 같은 억제를 반복하지 않는다.
    if (pending?.notBefore) {
      await db.update(roleplaySessions)
        .set({ pendingRealityIntent: { ...pending, notBefore: new Date(now.getTime() + POLICY.reality.recheckMinutes * 60_000).toISOString() } })
        .where(eq(roleplaySessions.id, sessionId))
    }
    return { outcome: 'suppressed', reason: decision.reason }
  }
  // 기능 플래그 — 알파에서는 사진·통화가 꺼져 있다. 채널만 낮추고 연락 자체는 보낸다.
  decision = { ...decision, channel: downgradeByFeature(decision.channel) }

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
    if (settings.pushEnabled) {
      await pushToUser(row.session.userId, {
        title: presented.senderLabel,
        body: channel === 'video' ? '영상통화 수신' : '전화 수신',
        url: `/chat/${sessionId}`, tag: `call:${sessionId}`,
      })
    }
    void track(row.session.userId, 'reality_contact_sent', { sessionId, channel: decision.channel, reason: intent.reason })
    return { outcome: 'sent', channel: decision.channel, contactId }
  }

  // ---- 내용 생성 (Provider 미구성 시 Mock, 숨기지 않음) ----
  installAIUsageSink()
  const llm = createAI({ mock: (req) => buildMockRealityContent(req.prompt), context: { userId: row.session.userId, sessionId } })

  const content = await generateRealityContent(llm, {
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
  })

  // ---- 발송: 메시지 + 기록 + Push, 한 트랜잭션 ----
  let contactId: string
  try {
    contactId = await db.transaction(async (tx) => {
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
        payload: { text: content.text, tone: content.tone, mediaUrl, ...presented },
        status: 'sent', sentAt: now, messageId: msg?.id ?? null,
      }).returning({ id: realityContacts.id })

      // 의도는 소비되었다. 다음 턴이나 다음 스케줄에서 다시 계산한다.
      await tx.update(roleplaySessions).set({ pendingRealityIntent: null })
        .where(eq(roleplaySessions.id, sessionId))

      return contact!.id
    })
  } catch (e) {
    // (session_id, dedupe_key) UNIQUE — 같은 사유가 이미 발송됐다. 조용히 넘기되 기록한다.
    if ((e as { code?: string }).code === '23505') { observe('reality.duplicate_prevented', { sessionId, channel: decision.channel }); return { outcome: 'skipped', reason: 'duplicate' } }
    throw e
  }
  void track(row.session.userId, 'reality_contact_sent', { sessionId, channel: decision.channel, reason: intent.reason })

  // Push 는 트랜잭션 밖에서. 실패해도 인앱 메시지는 이미 남아 있다.
  if (settings.pushEnabled) {
    await pushToUser(row.session.userId, {
      title: presented.senderLabel,
      body: content.text.length > 90 ? `${content.text.slice(0, 88)}…` : content.text,
      url: `/chat/${sessionId}`,
      tag: `session:${sessionId}`,
    })
  }

  return { outcome: 'sent', channel: decision.channel, contactId, text: content.text }
}

type RealityIntentRow = { channel: ContactChannel; reason: string; urgency: number; notBefore?: string }

function downgradeByFeature(c: ContactChannel): ContactChannel {
  if ((c === 'voice_call' && !feature('voiceCall')) || (c === 'video_call' && !feature('videoCall'))) return 'message'
  if (c === 'photo' && !feature('imageGeneration')) return 'message'
  return c
}

async function pushToUser(userId: string, payload: {
  title: string; body: string; url: string; tag: string
}): Promise<void> {
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
