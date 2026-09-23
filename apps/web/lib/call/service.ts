import { and, eq, inArray, isNull, lt } from 'drizzle-orm'
import { POLICY, feature } from '@miro/config'
import { db, callSessions, characters, contactProfiles, messages, realityContacts, roleplaySessions, userSettings, users } from '@miro/db'
import { inQuietHours } from '@miro/domain'
import type { CallChannel } from '@miro/domain'
import { resolveCallMedia } from '@miro/providers'
import { commit, reserve, rollback, UsageExceededError } from '@/lib/usage/guard'
import { track } from '@/lib/analytics/track'
import { observe } from '@/lib/observe'

export { UsageExceededError }

const usageKind = (c: CallChannel): 'voiceCallPerMinute' | 'videoCallPerMinute' =>
  c === 'voice' ? 'voiceCallPerMinute' : 'videoCallPerMinute'

/** 사용자가 Chat 에서 거는 통화. 1분을 먼저 예약하고 종료 시 실제 분으로 보정한다. */
export async function startOutgoingCall(userId: string, sessionId: string, channel: CallChannel) {
  if (!feature(channel === 'voice' ? 'voiceCall' : 'videoCall')) throw new Error('CALL_NOT_AVAILABLE')
  const [session] = await db.select({ id: roleplaySessions.id, experienceType: characters.experienceType })
    .from(roleplaySessions).innerJoin(characters, eq(characters.id, roleplaySessions.characterId)).where(and(
    eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt))).limit(1)
  if (!session) throw new Error('SESSION_NOT_FOUND')
  // 통화는 미로 캐릭터와만 한다. 사용량 예약보다 먼저 거절해 차감이 생기지 않게 한다.
  if (session.experienceType !== 'reality') throw new Error('CALL_NOT_AVAILABLE')
  const r = await reserve({
    userId, kind: usageKind(channel), units: 1,
    idempotencyKey: `call:out:${sessionId}:${Date.now()}`,
  })
  try {
  const [call] = await db.insert(callSessions).values({
    sessionId, channel, direction: 'outgoing', status: 'active',
    startedAt: new Date(), usageReservationId: r.reservationId,
  }).returning({ id: callSessions.id })
  void track(userId, 'call_started', { sessionId, channel, direction: 'outgoing' })
  return call!.id
  } catch (e) { await rollback(r.reservationId); throw e }
}

/**
 * 캐릭터가 거는 수신 통화. ringing 으로 만들고 사용자가 받기를 기다린다.
 * 세션당 ringing 하나 (partial UNIQUE) — 이미 울리는 중이면 null.
 */
export async function startIncomingCall(sessionId: string, channel: CallChannel, reason: string) {
  if (!feature(channel === 'voice' ? 'voiceCall' : 'videoCall')) return null
  return db.transaction(async tx => {
    const [row] = await tx.select({ session: roleplaySessions, character: characters, profile: contactProfiles, settings: userSettings, user: users })
      .from(roleplaySessions)
      .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
      .innerJoin(contactProfiles, eq(contactProfiles.characterId, characters.id))
      .innerJoin(users, eq(users.id, roleplaySessions.userId))
      .leftJoin(userSettings, eq(userSettings.userId, users.id))
      .where(eq(roleplaySessions.id, sessionId)).limit(1)
    if (!row || row.session.deletedAt || row.session.restrictedAt || row.session.status !== 'active'
      || row.character.deletedAt || row.character.experienceType !== 'reality' || row.user.deletedAt) return null
    // Serialize the last check with creator contact edits before opening a ringing call.
    const [profile] = await tx.select().from(contactProfiles).where(eq(contactProfiles.characterId, row.character.id)).limit(1).for('share')
    if (!profile?.enabled) return null
    const settings = {
      pushEnabled: row.settings?.pushEnabled ?? true,
      voiceCallEnabled: row.settings?.voiceCallEnabled ?? true,
      videoCallEnabled: row.settings?.videoCallEnabled ?? true,
      quietHoursEnabled: row.settings?.quietHoursEnabled ?? POLICY.quietHours.defaultEnabled,
      quietHoursStart: row.settings?.quietHoursStart ?? POLICY.quietHours.defaultStart,
      quietHoursEnd: row.settings?.quietHoursEnd ?? POLICY.quietHours.defaultEnd,
      timeZone: row.settings?.timeZone ?? POLICY.reality.defaultTimeZone,
    }
    if (!(channel === 'voice' ? settings.voiceCallEnabled : settings.videoCallEnabled) || inQuietHours(new Date(), settings)) return null
    const [call] = await tx.insert(callSessions).values({ sessionId, channel, direction: 'incoming', status: 'ringing', reason })
      .onConflictDoNothing().returning({ id: callSessions.id })
    return call?.id ?? null
  })
}

/** 수락. 이 시점에 사용량을 예약한다 — 받지 않은 통화에 사용량을 물리지 않는다. */
export async function acceptCall(userId: string, callId: string) {
  const call = await owned(userId, callId)
  if (!call || call.status !== 'ringing') return null
  if (!feature(call.channel === 'voice' ? 'voiceCall' : 'videoCall')) return null
  const r = await reserve({
    userId, kind: usageKind(call.channel), units: 1, idempotencyKey: `call:accept:${callId}`,
  })
  await db.update(callSessions)
    .set({ status: 'active', startedAt: new Date(), usageReservationId: r.reservationId })
    .where(and(eq(callSessions.id, callId), eq(callSessions.status, 'ringing')))
  void track(userId, 'call_started', { sessionId: call.sessionId, channel: call.channel, direction: 'incoming' })
  return call
}

/** 거절. 부재중/캐릭터 반응으로 이어질 수 있도록 기록을 남긴다 (명세서 5.2). */
export async function declineCall(userId: string, callId: string) {
  const call = await owned(userId, callId)
  if (!call || call.status !== 'ringing') return
  await db.transaction(async (tx) => {
    await tx.update(callSessions).set({ status: 'declined', endedAt: new Date(), result: 'declined' })
      .where(eq(callSessions.id, callId))
    await tx.insert(messages).values({
      sessionId: call.sessionId, role: 'system', kind: 'call_record',
      content: `${label(call.channel)} 거절`,
      blocks: [{ type: 'call', callId, channel: call.channel, result: 'declined' }],
      turnIndex: await turnOf(call.sessionId, tx),
    })
  })
}

/** 종료. 길이를 기록하고 실제 분으로 사용량을 확정한다. 통화 기록은 Chat 타임라인에 남는다. */
export async function endCall(userId: string, callId: string, result = 'completed') {
  const call = await owned(userId, callId)
  if (!call || call.status !== 'active') return null
  const endedAt = new Date()
  const durationSec = Math.max(0, Math.round((endedAt.getTime() - (call.startedAt ?? endedAt).getTime()) / 1000))
  const minutes = Math.max(1, Math.ceil(durationSec / 60))

  await db.transaction(async (tx) => {
    await tx.update(callSessions).set({ status: 'ended', endedAt, durationSec, result })
      .where(eq(callSessions.id, callId))
    await tx.insert(messages).values({
      sessionId: call.sessionId, role: 'system', kind: 'call_record',
      content: `${label(call.channel)} ${fmt(durationSec)}`,
      blocks: [{
        type: 'call', callId, channel: call.channel, result,
        startedAt: call.startedAt?.toISOString() ?? null, endedAt: endedAt.toISOString(), durationSec,
      }],
      turnIndex: await turnOf(call.sessionId, tx),
    })
    await tx.update(roleplaySessions).set({ lastInteractionAt: endedAt })
      .where(eq(roleplaySessions.id, call.sessionId))
  })
  if (call.usageReservationId) await commit(call.usageReservationId, minutes)
  await resolveCallMedia(call.channel).endSession({ callId }).catch(() => observe('call.cleanup_failed', { callId, channel: call.channel }))
  void track(userId, 'call_completed', { sessionId: call.sessionId, channel: call.channel, minutes, result })
  return { durationSec, minutes }
}

/** 연결이 끊긴 통화(active 가 너무 오래) 와 받지 않은 통화(ringing 만료)를 정리한다. Cron 에서 호출. */
export async function expireCalls(now = new Date()) {
  if (!feature('voiceCall') && !feature('videoCall')) return { missed: 0, timedOut: 0 }
  const ringingBefore = new Date(now.getTime() - POLICY.call.ringingTimeoutMinutes * 60_000)
  const missed = await db.select().from(callSessions)
    .where(and(eq(callSessions.status, 'ringing'), lt(callSessions.createdAt, ringingBefore)))
  for (const c of missed) {
    await db.transaction(async (tx) => {
      await tx.update(callSessions).set({ status: 'missed', endedAt: now, result: 'missed' })
        .where(and(eq(callSessions.id, c.id), eq(callSessions.status, 'ringing')))
      await tx.insert(messages).values({
        sessionId: c.sessionId, role: 'system', kind: 'call_record',
        content: `부재중 ${label(c.channel)}`,
        blocks: [{ type: 'call', callId: c.id, channel: c.channel, result: 'missed' }],
        turnIndex: await turnOf(c.sessionId, tx),
      })
    })
  }

  const activeBefore = new Date(now.getTime() - POLICY.call.maxMinutes * 60_000)
  const stale = await db.select().from(callSessions)
    .where(and(eq(callSessions.status, 'active'), lt(callSessions.startedAt, activeBefore)))
  for (const c of stale) {
    const durationSec = POLICY.call.maxMinutes * 60
    await db.update(callSessions).set({ status: 'ended', endedAt: now, durationSec, result: 'timeout' })
      .where(eq(callSessions.id, c.id))
    if (c.usageReservationId) await commit(c.usageReservationId, POLICY.call.maxMinutes)
  }
  return { missed: missed.length, timedOut: stale.length }
}

/** 사용자의 세션에서 지금 울리고 있는 통화. 수신 화면 표시용. */
export async function ringingFor(userId: string) {
  if (!feature('voiceCall') && !feature('videoCall')) return null
  const rows = await db.select({
    id: callSessions.id, channel: callSessions.channel, sessionId: callSessions.sessionId,
    reason: callSessions.reason, createdAt: callSessions.createdAt,
  })
    .from(callSessions)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, callSessions.sessionId))
    .where(and(
      eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt),
      eq(callSessions.status, 'ringing'),
    ))
    .limit(1)
  return rows[0] ?? null
}

export async function owned(userId: string, callId: string) {
  const rows = await db.select({ call: callSessions })
    .from(callSessions)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, callSessions.sessionId))
    .where(and(eq(callSessions.id, callId), eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt)))
    .limit(1)
  return rows[0]?.call ?? null
}

/** 통화 실패 시 예약을 되돌린다 (통화 연결 실패 → 텍스트 RP 로 전환 제안). */
export async function abortCall(userId: string, callId: string) {
  const call = await owned(userId, callId)
  if (!call) return
  await db.update(callSessions).set({ status: 'ended', endedAt: new Date(), result: 'failed' })
    .where(eq(callSessions.id, callId))
  if (call.usageReservationId) await rollback(call.usageReservationId)
}

/**
 * 트랜잭션 안에서 부를 때는 그 tx 를 넘긴다 — 전역 `db` 로 읽으면 커넥션을 하나 더
 * 요구하는데, 바깥 트랜잭션이 풀을 점유한 상태라 풀이 작으면 서로를 기다리다 멈춘다.
 */
async function turnOf(sessionId: string, reader: Pick<typeof db, 'select'> = db) {
  const [s] = await reader.select({ t: roleplaySessions.turnCount }).from(roleplaySessions)
    .where(eq(roleplaySessions.id, sessionId)).limit(1)
  return s?.t ?? 0
}
const label = (c: CallChannel) => (c === 'voice' ? '음성통화' : '영상통화')
const fmt = (sec: number) => `${Math.floor(sec / 60)}분 ${sec % 60}초`
export { inArray, realityContacts }
