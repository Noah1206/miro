import { and, eq, inArray, isNull, lt } from 'drizzle-orm'
import { POLICY } from '@miro/config'
import { db, callSessions, messages, realityContacts, roleplaySessions } from '@miro/db'
import type { CallChannel } from '@miro/domain'
import { resolveCallMedia } from '@miro/providers'
import { commit, reserve, rollback, UsageExceededError } from '@/lib/usage/guard'

export { UsageExceededError }

const usageKind = (c: CallChannel): 'voiceCallPerMinute' | 'videoCallPerMinute' =>
  c === 'voice' ? 'voiceCallPerMinute' : 'videoCallPerMinute'

/** 사용자가 Chat 에서 거는 통화. 1분을 먼저 예약하고 종료 시 실제 분으로 보정한다. */
export async function startOutgoingCall(userId: string, sessionId: string, channel: CallChannel) {
  const r = await reserve({
    userId, kind: usageKind(channel), units: 1,
    idempotencyKey: `call:out:${sessionId}:${Date.now()}`,
  })
  const [call] = await db.insert(callSessions).values({
    sessionId, channel, direction: 'outgoing', status: 'active',
    startedAt: new Date(), usageReservationId: r.reservationId,
  }).returning({ id: callSessions.id })
  return call!.id
}

/**
 * 캐릭터가 거는 수신 통화. ringing 으로 만들고 사용자가 받기를 기다린다.
 * 세션당 ringing 하나 (partial UNIQUE) — 이미 울리는 중이면 null.
 */
export async function startIncomingCall(sessionId: string, channel: CallChannel, reason: string) {
  try {
    const [call] = await db.insert(callSessions).values({
      sessionId, channel, direction: 'incoming', status: 'ringing', reason,
    }).returning({ id: callSessions.id })
    return call!.id
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return null
    throw e
  }
}

/** 수락. 이 시점에 사용량을 예약한다 — 받지 않은 통화에 사용량을 물리지 않는다. */
export async function acceptCall(userId: string, callId: string) {
  const call = await owned(userId, callId)
  if (!call || call.status !== 'ringing') return null
  const r = await reserve({
    userId, kind: usageKind(call.channel), units: 1, idempotencyKey: `call:accept:${callId}`,
  })
  await db.update(callSessions)
    .set({ status: 'active', startedAt: new Date(), usageReservationId: r.reservationId })
    .where(and(eq(callSessions.id, callId), eq(callSessions.status, 'ringing')))
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
      turnIndex: await turnOf(call.sessionId),
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
      turnIndex: await turnOf(call.sessionId),
    })
    await tx.update(roleplaySessions).set({ lastInteractionAt: endedAt })
      .where(eq(roleplaySessions.id, call.sessionId))
  })
  if (call.usageReservationId) await commit(call.usageReservationId, minutes)
  await resolveCallMedia(call.channel).endSession(`mock:${call.channel}:${callId}`).catch(() => {})
  return { durationSec, minutes }
}

/** 연결이 끊긴 통화(active 가 너무 오래) 와 받지 않은 통화(ringing 만료)를 정리한다. Cron 에서 호출. */
export async function expireCalls(now = new Date()) {
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
        turnIndex: await turnOf(c.sessionId),
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
  const rows = await db.select({
    id: callSessions.id, channel: callSessions.channel, sessionId: callSessions.sessionId,
    reason: callSessions.reason, createdAt: callSessions.createdAt,
  })
    .from(callSessions)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, callSessions.sessionId))
    .where(and(
      eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt),
      eq(callSessions.status, 'ringing'),
    ))
    .limit(1)
  return rows[0] ?? null
}

export async function owned(userId: string, callId: string) {
  const rows = await db.select({ call: callSessions })
    .from(callSessions)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, callSessions.sessionId))
    .where(and(eq(callSessions.id, callId), eq(roleplaySessions.userId, userId)))
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

async function turnOf(sessionId: string) {
  const [s] = await db.select({ t: roleplaySessions.turnCount }).from(roleplaySessions)
    .where(eq(roleplaySessions.id, sessionId)).limit(1)
  return s?.t ?? 0
}
const label = (c: CallChannel) => (c === 'voice' ? '음성통화' : '영상통화')
const fmt = (sec: number) => `${Math.floor(sec / 60)}분 ${sec % 60}초`
export { inArray, realityContacts }
