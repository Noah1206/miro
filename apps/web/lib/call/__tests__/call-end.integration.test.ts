import { afterAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, callSessions, relationships, roleplaySessions, usageWindows, users, worldStates } from '@miro/db'
import { POLICY } from '@miro/config'
import { cloneAsReality, dropRealityClones } from '@/lib/reality/__tests__/fixtures'

const auth = vi.hoisted(() => ({ userId: null as string | null }))
vi.mock('@/lib/auth', () => ({ currentUser: async () => (auth.userId ? { id: auth.userId } : null) }))
const { expireCalls, startOutgoingCall } = await import('../service')
const { POST } = await import('@/app/api/calls/[callId]/end/route')

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const perMinute = POLICY.usage.weights.voiceCallPerMinute

describeDb('ending a call the user walked away from', () => {
  const made: string[] = []
  async function call() {
    const [u] = await db.insert(users).values({ email: `ce-${randomBytes(5).toString('hex')}@miro.dev`, plan: 'pro' }).returning()
    made.push(u!.id)
    const c = await cloneAsReality('taeyun')
    const [s] = await db.insert(roleplaySessions).values({ userId: u!.id, characterId: c.id, worldId: c.worldId }).returning({ id: roleplaySessions.id })
    await db.insert(worldStates).values({ sessionId: s!.id, currentLocation: '서울', currentTime: '저녁' })
    await db.insert(relationships).values({ sessionId: s!.id })
    const callId = await startOutgoingCall(u!.id, s!.id, 'voice')
    return { userId: u!.id, callId }
  }
  const consumed = async (userId: string) => (await db.select().from(usageWindows).where(eq(usageWindows.userId, userId)))[0]!.consumed
  const beacon = (callId: string, origin = 'https://miro.test') =>
    POST(new Request(`https://miro.test/api/calls/${callId}/end`, { method: 'POST', headers: { origin, host: 'miro.test' } }), { params: Promise.resolve({ callId }) })
  afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)); await dropRealityClones() })

  it('a call nobody hung up is closed by the cron and billed only the reserved minute, not thirty', async () => {
    const { userId, callId } = await call()
    await expireCalls(new Date(Date.now() + (POLICY.call.maxMinutes + 1) * 60_000))
    const [c] = await db.select().from(callSessions).where(eq(callSessions.id, callId))
    expect(c).toMatchObject({ status: 'ended', result: 'timeout', durationSec: null })
    expect(await consumed(userId)).toBe(perMinute)
  })

  it('the leave-page beacon ends the owner\'s call at its real length', async () => {
    const { userId, callId } = await call()
    await db.update(callSessions).set({ startedAt: new Date(Date.now() - 150_000) }).where(eq(callSessions.id, callId))
    auth.userId = userId
    expect((await beacon(callId)).status).toBe(204)
    const [c] = await db.select().from(callSessions).where(eq(callSessions.id, callId))
    expect(c).toMatchObject({ status: 'ended', result: 'closed' })
    expect(await consumed(userId)).toBe(perMinute * 3)
  })

  it('refuses another user and another site', async () => {
    const { callId } = await call()
    const other = await call()
    auth.userId = other.userId
    await beacon(callId)
    expect((await db.select().from(callSessions).where(eq(callSessions.id, callId)))[0]!.status).toBe('active')
    expect((await beacon(callId, 'https://evil.example')).status).toBe(403)
  })
})
