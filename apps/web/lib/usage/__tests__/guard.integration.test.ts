import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, subscriptions, usageLedger, usageWindows, users } from '@miro/db'
import { POLICY } from '@miro/config'
import { UsageExceededError, commit, effectivePlan, guarded, reserve, rollback, usageStatus } from '../guard'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const T0 = new Date('2026-09-12T13:20:00+09:00')

describeDb('usage guard', () => {
  const made: string[] = []
  async function user(plan: 'free' | 'pro' = 'free') {
    const [u] = await db.insert(users)
      .values({ email: `ug-${randomBytes(5).toString('hex')}@miro.dev`, plan }).returning()
    made.push(u!.id); return u!.id
  }
  afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })

  it('the window opens at the first request and ends 5h later', async () => {
    const id = await user()
    await reserve({ userId: id, kind: 'textRP', idempotencyKey: `k:${id}:1`, now: T0 })
    const [w] = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
    expect(w!.startedAt.getTime()).toBe(T0.getTime())
    expect(w!.endsAt.getTime()).toBe(T0.getTime() + 5 * 3600_000)
    expect(w!.consumed).toBe(POLICY.usage.weights.textRP)
  })

  it('the same idempotency key is charged once', async () => {
    const id = await user()
    const a = await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:same`, now: T0 })
    const b = await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:same`, now: T0 })
    expect(b.reservationId).toBe(a.reservationId)
    expect(b.reused).toBe(true)
    const [w] = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
    expect(w!.consumed).toBe(POLICY.usage.weights.photo)
  })

  it('a failed provider call is rolled back and costs nothing', async () => {
    const id = await user()
    await expect(guarded(
      { userId: id, kind: 'photo', idempotencyKey: `k:${id}:fail` },
      async () => { throw new Error('provider down') },
    )).rejects.toThrow('provider down')
    const [w] = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
    expect(w!.consumed).toBe(0)
    const [l] = await db.select().from(usageLedger).where(eq(usageLedger.userId, id))
    expect(l!.status).toBe('rolled_back')
  })

  it('rejects once the limit would be exceeded, without touching any state', async () => {
    const id = await user()
    await reserve({ userId: id, kind: 'textRP', idempotencyKey: `k:${id}:open`, now: T0 })
    await db.update(usageWindows).set({ consumed: POLICY.usage.limits.free - 1 })
      .where(eq(usageWindows.userId, id))
    await expect(reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:over`, now: T0 }))
      .rejects.toBeInstanceOf(UsageExceededError)
    // 1단위짜리는 아직 들어간다
    const ok = await reserve({ userId: id, kind: 'textRP', idempotencyKey: `k:${id}:last`, now: T0 })
    expect(ok.cost).toBe(1)
    const s = await usageStatus(id, T0)
    expect(s.remaining).toBe(0)
    expect(s.resetsAt!.getTime()).toBe(T0.getTime() + 5 * 3600_000)   // 소진 시점이 아니라 창 종료 시각
  })

  it('pro gets the pro limit, same features', async () => {
    const id = await user('pro')
    await reserve({ userId: id, kind: 'textRP', idempotencyKey: `k:${id}:p`, now: T0 })
    const [w] = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
    expect(w!.limit).toBe(POLICY.usage.limits.pro)
    expect(w!.limit).toBeGreaterThan(POLICY.usage.limits.free)
  })

  it('after the window expires the next request opens a new one starting then', async () => {
    const id = await user()
    await reserve({ userId: id, kind: 'textRP', idempotencyKey: `k:${id}:w1`, now: T0 })
    const later = new Date(T0.getTime() + 6 * 3600_000)
    await reserve({ userId: id, kind: 'textRP', idempotencyKey: `k:${id}:w2`, now: later })
    const wins = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
    expect(wins).toHaveLength(2)
    expect(wins.some((w) => w.startedAt.getTime() === later.getTime())).toBe(true)
  })

  it('a cancelled subscription keeps pro until the period ends', async () => {
    const id = await user('free')
    const now = new Date()
    await db.insert(subscriptions).values({
      userId: id, status: 'cancelled', renewalStatus: 'cancelled',
      currentPeriodStart: new Date(now.getTime() - 86_400_000),
      currentPeriodEnd: new Date(now.getTime() + 86_400_000),
    })
    expect(await effectivePlan(id, now)).toBe('pro')
    expect(await effectivePlan(id, new Date(now.getTime() + 2 * 86_400_000))).toBe('free')
  })

  it('commit can adjust to actual units (calls are billed per minute)', async () => {
    const id = await user('pro')
    const r = await reserve({ userId: id, kind: 'voiceCallPerMinute', units: 1, idempotencyKey: `k:${id}:call`, now: T0 })
    await commit(r.reservationId, 4)
    const [w] = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
    expect(w!.consumed).toBe(POLICY.usage.weights.voiceCallPerMinute * 4)
    await rollback(r.reservationId)   // committed 후 rollback 은 무시되지 않는다 — 명시적 취소
    const [w2] = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
    expect(w2!.consumed).toBe(0)
  })

  it('concurrent first requests share one window', async () => {
    const id = await user()
    await Promise.all(Array.from({ length: 5 }, (_, i) =>
      reserve({ userId: id, kind: 'textRP', idempotencyKey: `k:${id}:c${i}`, now: T0 })))
    const wins = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
    expect(wins).toHaveLength(1)
    expect(wins[0]!.consumed).toBe(5)
  })
})
