import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users, conversationRequests, usageLedger } from '@miro/db'
import { createRoleplaySession } from '@/lib/simulation/start'
import { reserve, commit, usageStatus } from '@/lib/usage/guard'
import { beginRequest, failRequest } from '../gateway'
import { maintainAI } from '../maintenance'

const made: string[] = []
const describeDb = process.env.DATABASE_URL ? describe : describe.skip
async function pending() {
  const [user] = await db.insert(users).values({ email: `recovery-${randomUUID()}@example.test` }).returning()
  made.push(user!.id)
  const { sessionId } = await createRoleplaySession(user!.id, 'thomas')
  const { requestId } = await beginRequest(user!.id, sessionId, '안녕')
  const reservation = await reserve({ userId: user!.id, kind: 'textRP', idempotencyKey: `turn:${requestId}` })
  return { userId: user!.id, sessionId, requestId, reservation }
}
afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })
describeDb('request recovery atomicity', () => {
  it('concurrent failure handlers refund a request only once', async () => {
    const s = await pending()
    const results = await Promise.all([failRequest(s.requestId), failRequest(s.requestId)])
    expect(results.sort()).toEqual([false, true])
    expect((await usageStatus(s.userId)).consumed).toBe(0)
    const [r] = await db.select().from(conversationRequests).where(eq(conversationRequests.id, s.requestId))
    const [l] = await db.select().from(usageLedger).where(eq(usageLedger.id, s.reservation.reservationId))
    expect(r!.status).toBe('failed')
    expect(l!.status).toBe('rolled_back')
  })
  it('does not expire a request whose lease is still active', async () => {
    const s = await pending()
    expect(await failRequest(s.requestId, new Date())).toBe(false)
    expect((await usageStatus(s.userId)).consumed).toBe(1)
    await failRequest(s.requestId)
  })
  it('does not change a committed result or charge when cleanup sees it late', async () => {
    const s = await pending()
    await commit(s.reservation.reservationId)
    await db.update(conversationRequests).set({ status: 'completed', result: { ok: true } }).where(eq(conversationRequests.id, s.requestId))
    expect(await failRequest(s.requestId, new Date(Date.now() + 3600_000))).toBe(false)
    expect((await usageStatus(s.userId)).consumed).toBe(1)
    expect((await beginRequest(s.userId, s.sessionId, '안녕', s.requestId)).cached).toEqual({ ok: true })
  })
  it('maintenance closes expired requests and releases their reservations', async () => {
    const s = await pending()
    await db.update(conversationRequests).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(conversationRequests.id, s.requestId))
    await maintainAI()
    expect((await usageStatus(s.userId)).consumed).toBe(0)
    const [r] = await db.select().from(conversationRequests).where(eq(conversationRequests.id, s.requestId))
    expect(r!.status).toBe('failed')
  })
})
