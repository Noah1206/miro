import { afterAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, callSessions, characters, messages, relationships, roleplaySessions, usageWindows, userSettings, users, worldStates, worlds } from '@miro/db'
import { POLICY } from '@miro/config'
import { acceptCall, declineCall, endCall, expireCalls, startIncomingCall, startOutgoingCall } from '../service'
import { evaluateSession } from '@/lib/reality/evaluate'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const DAY = new Date('2026-09-12T14:00:00+09:00')

describeDb('calls', () => {
  const made: string[] = []
  async function session(plan: 'free' | 'pro' = 'pro') {
    const [u] = await db.insert(users).values({ email: `cl-${randomBytes(5).toString('hex')}@miro.dev`, plan }).returning()
    made.push(u!.id)
    await db.insert(userSettings).values({ userId: u!.id, quietHoursEnabled: false })
    const [c] = await db.select({ id: characters.id, worldId: worlds.id })
      .from(characters).innerJoin(worlds, eq(worlds.characterId, characters.id)).where(eq(characters.slug, 'taeyun')).limit(1)
    const [s] = await db.insert(roleplaySessions).values({
      userId: u!.id, characterId: c!.id, worldId: c!.worldId, lastInteractionAt: new Date(DAY.getTime() - 3 * 3600_000),
    }).returning({ id: roleplaySessions.id })
    await db.insert(worldStates).values({ sessionId: s!.id, currentLocation: '서울', currentTime: '저녁' })
    await db.insert(relationships).values({ sessionId: s!.id, trust: 50, attachment: 50, emotionalDistance: 40 })
    return { userId: u!.id, sessionId: s!.id }
  }
  afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })

  it('only one ringing call per session', async () => {
    const { sessionId } = await session()
    expect(await startIncomingCall(sessionId, 'voice', 'a')).not.toBeNull()
    expect(await startIncomingCall(sessionId, 'video', 'b')).toBeNull()
  })

  it('Scenario 4: incoming video → accept reserves usage → end records duration and bills actual minutes', async () => {
    const { userId, sessionId } = await session()
    const callId = (await startIncomingCall(sessionId, 'video', 'wanted to see you'))!
    // 받기 전에는 사용량이 없다
    expect(await db.select().from(usageWindows).where(eq(usageWindows.userId, userId))).toHaveLength(0)

    const accepted = await acceptCall(userId, callId)
    expect(accepted?.channel).toBe('video')
    const [w1] = await db.select().from(usageWindows).where(eq(usageWindows.userId, userId))
    expect(w1!.consumed).toBe(POLICY.usage.weights.videoCallPerMinute)   // 1분 예약

    // 3분 넘게 통화한 것으로
    await db.update(callSessions).set({ startedAt: new Date(Date.now() - 200_000) }).where(eq(callSessions.id, callId))
    const r = await endCall(userId, callId)
    expect(r?.minutes).toBe(4)
    const [w2] = await db.select().from(usageWindows).where(eq(usageWindows.userId, userId))
    expect(w2!.consumed).toBe(POLICY.usage.weights.videoCallPerMinute * 4)

    const [rec] = await db.select().from(messages).where(and(eq(messages.sessionId, sessionId), eq(messages.kind, 'call_record')))
    expect(rec!.content).toMatch(/영상통화 3분/)
    const [c] = await db.select().from(callSessions).where(eq(callSessions.id, callId))
    expect(c!.status).toBe('ended')
    expect(c!.durationSec).toBeGreaterThanOrEqual(200)
  })

  it('declining leaves a record and never charges', async () => {
    const { userId, sessionId } = await session()
    const callId = (await startIncomingCall(sessionId, 'voice', 'x'))!
    await declineCall(userId, callId)
    const [rec] = await db.select().from(messages).where(and(eq(messages.sessionId, sessionId), eq(messages.kind, 'call_record')))
    expect(rec!.content).toBe('음성통화 거절')
    expect(await db.select().from(usageWindows).where(eq(usageWindows.userId, userId))).toHaveLength(0)
  })

  it('an unanswered call becomes a missed call after the timeout', async () => {
    const { sessionId } = await session()
    const callId = (await startIncomingCall(sessionId, 'voice', 'x'))!
    await expireCalls(new Date(Date.now() + (POLICY.call.ringingTimeoutMinutes + 1) * 60_000))
    const [c] = await db.select().from(callSessions).where(eq(callSessions.id, callId))
    expect(c!.status).toBe('missed')
    const [rec] = await db.select().from(messages).where(and(eq(messages.sessionId, sessionId), eq(messages.kind, 'call_record')))
    expect(rec!.content).toBe('부재중 음성통화')
  })

  it('another user cannot accept my call', async () => {
    const a = await session(); const b = await session()
    const callId = (await startIncomingCall(a.sessionId, 'voice', 'x'))!
    expect(await acceptCall(b.userId, callId)).toBeNull()
  })

  it('an outgoing call is refused when usage is exhausted, with state untouched', async () => {
    const { userId, sessionId } = await session('free')
    await startOutgoingCall(userId, sessionId, 'voice')   // opens window
    await db.update(usageWindows).set({ consumed: POLICY.usage.limits.free }).where(eq(usageWindows.userId, userId))
    await expect(startOutgoingCall(userId, sessionId, 'video')).rejects.toThrow('usage limit')
    const [rel] = await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))
    expect(rel!.version).toBe(1)
  })

  it('reality activation can place a video call, which rings instead of messaging', async () => {
    const { sessionId } = await session()
    await db.update(roleplaySessions)
      .set({ pendingRealityIntent: { channel: 'video_call', reason: 'wanted to see you', urgency: 0.95 } })
      .where(eq(roleplaySessions.id, sessionId))
    const r = await evaluateSession(sessionId, DAY)
    expect(r).toMatchObject({ outcome: 'sent', channel: 'video_call' })
    const [c] = await db.select().from(callSessions).where(eq(callSessions.sessionId, sessionId))
    expect(c!.status).toBe('ringing')
    expect(c!.channel).toBe('video')
    expect(await db.select().from(messages).where(eq(messages.sessionId, sessionId))).toHaveLength(0)
  })

  it('video calls are blocked when the user disabled them', async () => {
    const { userId, sessionId } = await session()
    await db.update(userSettings).set({ videoCallEnabled: false }).where(eq(userSettings.userId, userId))
    await db.update(roleplaySessions)
      .set({ pendingRealityIntent: { channel: 'video_call', reason: 'x', urgency: 0.95 } })
      .where(eq(roleplaySessions.id, sessionId))
    expect(await evaluateSession(sessionId, DAY)).toEqual({ outcome: 'suppressed', reason: 'channel_disabled' })
  })
})
