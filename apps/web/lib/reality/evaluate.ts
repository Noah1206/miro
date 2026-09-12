import { and, desc, eq, isNull } from 'drizzle-orm'
import { POLICY } from '@miro/config'
import {
  db, characters, contactProfiles, events, messages, pushSubscriptions,
  realityContacts, relationships, roleplaySessions, userSettings, worldStates,
} from '@miro/db'
import {
  deriveIntent, describeRelationship, evaluateRealityContact, presentContact,
} from '@miro/domain'
import type { ContactChannel, RealityContact, SuppressReason } from '@miro/domain'
import {
  MockLLMProvider, buildMockRealityContent, generateRealityContent,
  resolveLLM, resolvePush,
} from '@miro/providers'
import { getOrGenerate } from '@/lib/simulation/media'

export type EvaluateOutcome =
  | { outcome: 'sent'; channel: ContactChannel; contactId: string }
  | { outcome: 'suppressed'; reason: SuppressReason }
  | { outcome: 'no_intent' }
  | { outcome: 'skipped'; reason: 'session_not_found' | 'duplicate' }

/**
 * 한 세션에 대한 선연락 판단과 발송.
 *
 * 스케줄러는 "지금 판단해볼 시점인가" 만 정한다. 실제로 연락할지는
 * 이 함수가 현재 상태(관계·사건·성향·설정·시각)로 결정한다.
 * 가입 후 경과 시간 같은 값은 입력에 없다.
 */
export async function evaluateSession(sessionId: string, now = new Date()): Promise<EvaluateOutcome> {
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
  const intent = deriveIntent({
    relationship: row.relationship as never,
    activeEvents: activeEvents as never,
    contactProfile: profile,
    idleMinutes,
    pending: (row.session.pendingRealityIntent as never) ?? null,
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
  const decision = evaluateRealityContact({
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
    return { outcome: 'suppressed', reason: decision.reason }
  }

  // ---- 내용 생성 (Provider 미구성 시 Mock, 숨기지 않음) ----
  const presented = presentContact(decision.channel, row.character.name, row.profile.presentation)
  const configured = resolveLLM()
  const llm = configured.info.mode === 'live'
    ? configured
    : new MockLLMProvider((p) => buildMockRealityContent(p))

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
    if ((e as { code?: string }).code === '23505') return { outcome: 'skipped', reason: 'duplicate' }
    throw e
  }

  // Push 는 트랜잭션 밖에서. 실패해도 인앱 메시지는 이미 남아 있다.
  if (settings.pushEnabled) {
    await pushToUser(row.session.userId, {
      title: presented.senderLabel,
      body: content.text.length > 90 ? `${content.text.slice(0, 88)}…` : content.text,
      url: `/chat/${sessionId}`,
      tag: `session:${sessionId}`,
    })
  }

  return { outcome: 'sent', channel: decision.channel, contactId }
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
      console.warn('[push] failed', { userId, gone: r.gone, error: r.error })
      if (r.gone) {
        await db.update(pushSubscriptions).set({ failedAt: new Date() })
          .where(eq(pushSubscriptions.id, s.id))
      }
    }
  }
}
