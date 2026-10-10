import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, users, usageLedger, usageWindows } from '@miro/db'
import { reserve, grantRecharge, rechargeBalance, rollback, settleTokensInTransaction, usageStatus } from '../guard'
const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const ids: string[] = []
async function user(balance = 100) {
  const [u] = await db.insert(users).values({ email: `tokens-${randomUUID()}@miro.test`, plan: 'free' }).returning()
  ids.push(u!.id)
  if (balance) await grantRecharge({ userId: u!.id, amount: balance, source: 'grant' })
  return u!.id
}
afterAll(async () => { for (const id of ids) await db.delete(users).where(eq(users.id, id)) })
describeDb('token reservations and atomic settlement', () => {
  it('gives new free accounts no recurring allowance and stops before a zero-balance generation', async () => {
    const id = await user(0)
    expect((await usageStatus(id)).remaining).toBe(0)
    await expect(reserve({ userId: id, kind: 'textRP', tokenAmount: 20, idempotencyKey: randomUUID() })).rejects.toThrow('usage limit')
  })
  it('reserves once and returns all unused purchased tokens during exact settlement', async () => {
    const id = await user()
    const key = randomUUID()
    const a = await reserve({ userId: id, kind: 'textRP', tokenAmount: 40, idempotencyKey: key })
    const b = await reserve({ userId: id, kind: 'textRP', tokenAmount: 40, idempotencyKey: key })
    expect(b.reservationId).toBe(a.reservationId)
    expect(await rechargeBalance(id)).toBe(60)
    await db.transaction(tx => settleTokensInTransaction(tx, a.reservationId, id, 13))
    expect(await rechargeBalance(id)).toBe(87)
    expect(await db.transaction(tx => settleTokensInTransaction(tx, a.reservationId, id, 13))).toBe(false)
    await rollback(a.reservationId)
    expect(await rechargeBalance(id)).toBe(87)
    const [row] = await db.select().from(usageLedger).where(eq(usageLedger.id, a.reservationId))
    expect(row!.amount).toBe(13)
  })
  it('restores failed generation exactly and never spends the same balance concurrently', async () => {
    const id = await user(40)
    const calls = await Promise.allSettled([1, 2].map(() => reserve({ userId: id, kind: 'textRP', tokenAmount: 30, idempotencyKey: randomUUID() })))
    expect(calls.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const fulfilled = calls.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof reserve>>>
    await rollback(fulfilled.value.reservationId)
    expect(await rechargeBalance(id)).toBe(40)
  })
  it('preserves existing monthly grants and refunds back to both original sources', async () => {
    const id = await user(40)
    const now = new Date()
    await db.insert(usageWindows).values({ userId: id, plan: 'free', startedAt: new Date(now.getTime() - 1000), endsAt: new Date(now.getTime() + 86400000), limit: 10, consumed: 0, period: 'monthly', policyVersion: 'monthly-v1' })
    const a = await reserve({ userId: id, kind: 'textRP', tokenAmount: 30, idempotencyKey: randomUUID() })
    expect(a.fromGrants).toBe(20)
    await db.transaction(tx => settleTokensInTransaction(tx, a.reservationId, id, 5))
    expect(await rechargeBalance(id)).toBe(40)
    expect((await usageStatus(id)).remaining).toBe(5)
  })
  it('rejects another owner and over-reservation settlement without altering balances', async () => {
    const id = await user(), other = await user()
    const a = await reserve({ userId: id, kind: 'textRP', tokenAmount: 20, idempotencyKey: randomUUID() })
    expect(await db.transaction(tx => settleTokensInTransaction(tx, a.reservationId, other, 1))).toBe(false)
    await expect(db.transaction(tx => settleTokensInTransaction(tx, a.reservationId, id, 21))).rejects.toThrow('invalid token settlement')
    expect(await rechargeBalance(id)).toBe(80)
  })
})
