import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, rechargeGrants, rechargeLedger, subscriptions, usageLedger, usageWindows, users } from '@miro/db'
import { POLICY } from '@miro/config'
import { UsageExceededError, commit, effectivePlan, grantRecharge, guarded, rechargeBalance, reserve, revokeRecharge, rollback, usageStatus } from '../guard'

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

  it('uses KST calendar months', async () => {
    const id = await user()
    await reserve({ userId: id, kind: 'textRP', idempotencyKey: `k:${id}:1`, now: T0 })
    const [w] = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
    expect(w!.startedAt.toISOString()).toBe('2026-08-31T15:00:00.000Z')
    expect(w!.endsAt.getTime()).toBe(new Date('2026-09-30T15:00:00Z').getTime())
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
    expect(s.resetsAt!.getTime()).toBe(new Date('2026-09-30T15:00:00Z').getTime())   // 소진 시점이 아니라 창 종료 시각
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
    const later = new Date('2026-09-30T15:00:00Z')
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
    expect(w2!.consumed).toBe(POLICY.usage.weights.voiceCallPerMinute * 4)
  })

  it('concurrent first requests share one window', async () => {
    const id = await user()
    await Promise.all(Array.from({ length: 5 }, (_, i) =>
      reserve({ userId: id, kind: 'textRP', idempotencyKey: `k:${id}:c${i}`, now: T0 })))
    const wins = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
    expect(wins).toHaveLength(1)
    expect(wins[0]!.consumed).toBe(5)
  })

  /** 4단계 — 충전 원장과 통합 차감. */
  describe('recharge grants', () => {
    const FREE = POLICY.usage.limits.free
    const PHOTO = POLICY.usage.weights.photo
    /** 월간 제공량을 정확히 소진시킨다. */
    const drain = (id: string) => reserve({ userId: id, kind: 'photo', units: FREE / PHOTO, idempotencyKey: `drain:${id}`, now: T0 })

    it('spends the monthly allowance before touching the purchased balance', async () => {
      const id = await user()
      await grantRecharge({ userId: id, amount: 50, source: 'grant' })
      await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:m`, now: T0 })
      // 월간이 남아 있으면 충전 잔액은 그대로다.
      expect(await rechargeBalance(id)).toBe(50)
      const [w] = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
      expect(w!.consumed).toBe(PHOTO)
    })

    it('splits one reservation across both sources and records each share', async () => {
      const id = await user()
      await grantRecharge({ userId: id, amount: 50, source: 'grant' })
      // 월간을 한 칸만 남기고 비운다 — textRP 는 1 단위라 정확히 맞출 수 있다.
      await reserve({ userId: id, kind: 'textRP', units: FREE - 1, idempotencyKey: `k:${id}:almost`, now: T0 })
      const r = await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:split`, now: T0 })
      expect(r.fromGrants).toBe(PHOTO - 1)
      const [w] = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
      expect(w!.consumed).toBe(FREE)                       // 월간은 딱 한도까지만
      expect(await rechargeBalance(id)).toBe(50 - (PHOTO - 1))
    })

    it('refunds a failed generation to the exact source it came from', async () => {
      const id = await user()
      await grantRecharge({ userId: id, amount: 50, source: 'grant' })
      await drain(id)
      const r = await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:fail`, now: T0 })
      expect(r.fromGrants).toBe(PHOTO)
      await rollback(r.reservationId)
      expect(await rechargeBalance(id)).toBe(50)           // 충전 잔액으로 되돌아온다
      const [w] = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
      expect(w!.consumed).toBe(FREE)                       // 월간은 건드리지 않는다
      expect(await db.select().from(rechargeLedger).where(eq(rechargeLedger.ledgerId, r.reservationId))).toHaveLength(0)
    })

    it('blocks only when both sources are empty', async () => {
      const id = await user()
      await grantRecharge({ userId: id, amount: PHOTO, source: 'grant' })
      await drain(id)
      await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:last`, now: T0 })
      expect(await rechargeBalance(id)).toBe(0)
      await expect(reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:over`, now: T0 }))
        .rejects.toThrow(UsageExceededError)
    })

    it('retrying the same request does not spend the balance twice', async () => {
      const id = await user()
      await grantRecharge({ userId: id, amount: 50, source: 'grant' })
      await drain(id)
      const a = await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:retry`, now: T0 })
      const b = await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:retry`, now: T0 })
      expect(b.reused).toBe(true)
      expect(b.reservationId).toBe(a.reservationId)
      expect(await rechargeBalance(id)).toBe(50 - PHOTO)
      expect(await db.select().from(rechargeLedger).where(eq(rechargeLedger.ledgerId, a.reservationId))).toHaveLength(1)
    })

    it('concurrent requests never overdraw the balance', async () => {
      const id = await user()
      await grantRecharge({ userId: id, amount: 3 * PHOTO, source: 'grant' })
      await drain(id)
      // 잔액으로는 3건만 가능한데 6건이 동시에 들어온다.
      const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) =>
        reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:race${i}`, now: T0 })))
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(3)
      expect(await rechargeBalance(id)).toBe(0)
      const [g] = await db.select().from(rechargeGrants).where(eq(rechargeGrants.userId, id))
      expect(g!.consumed).toBeLessThanOrEqual(g!.amount)   // 음수 잔액도, 이중 사용도 없다
    })

    it('uses the balance that expires first, and skips expired ones', async () => {
      const id = await user()
      const soon = new Date(T0.getTime() + 86_400_000)
      const later = new Date(T0.getTime() + 30 * 86_400_000)
      const expired = new Date(T0.getTime() - 86_400_000)
      await grantRecharge({ userId: id, amount: PHOTO, source: 'grant', expiresAt: later })
      await grantRecharge({ userId: id, amount: PHOTO, source: 'grant', expiresAt: soon })
      await grantRecharge({ userId: id, amount: PHOTO, source: 'grant', expiresAt: expired })
      expect(await rechargeBalance(id, T0)).toBe(2 * PHOTO)   // 만료된 것은 세지 않는다
      await drain(id)
      const r = await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:exp`, now: T0 })
      const [part] = await db.select().from(rechargeLedger).where(eq(rechargeLedger.ledgerId, r.reservationId))
      const [used] = await db.select().from(rechargeGrants).where(eq(rechargeGrants.id, part!.grantId))
      expect(used!.expiresAt!.getTime()).toBe(soon.getTime())
    })

    it('a new month resets the allowance and keeps the purchased balance', async () => {
      const id = await user()
      await grantRecharge({ userId: id, amount: 50, source: 'grant' })
      await drain(id)
      await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:sep`, now: T0 })
      expect(await rechargeBalance(id)).toBe(50 - PHOTO)
      // 다음 달 — 새 창이 열린다.
      const nextMonth = new Date('2026-10-02T13:20:00+09:00')
      await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:oct`, now: nextMonth })
      const wins = await db.select().from(usageWindows).where(eq(usageWindows.userId, id))
      expect(wins).toHaveLength(2)
      const fresh = wins.find(w => w.startedAt.getTime() > T0.getTime())!
      expect(fresh.consumed).toBe(PHOTO)                   // 새 달은 월간부터 다시 쓴다
      expect(await rechargeBalance(id)).toBe(50 - PHOTO)   // 구매 잔액은 초기화되지 않는다
    })

    it('grants the same verified payment once, and revokes only what is unused', async () => {
      const id = await user()
      const paid = { userId: id, amount: 50, source: 'purchase' as const, provider: 'mock', externalRef: `order-${id}` }
      const first = await grantRecharge(paid)
      const replay = await grantRecharge(paid)             // 같은 결제 이벤트가 두 번 와도
      expect(replay.granted).toBe(false)
      expect(replay.grantId).toBe(first.grantId)
      expect(await rechargeBalance(id)).toBe(50)           // 잔액은 한 번만 늘어난다

      await drain(id)
      await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:used`, now: T0 })
      const { revoked } = await revokeRecharge('mock', `order-${id}`)
      expect(revoked).toBe(50 - PHOTO)                     // 이미 쓴 만큼은 회수하지 않는다
      expect(await rechargeBalance(id)).toBe(0)
    })

    it('reports the purchased balance separately from the monthly allowance', async () => {
      const id = await user()
      await grantRecharge({ userId: id, amount: 40, source: 'grant' })
      await reserve({ userId: id, kind: 'photo', idempotencyKey: `k:${id}:status`, now: T0 })
      const s = await usageStatus(id)
      expect(s.rechargeRemaining).toBe(40)
      expect(s.consumed).toBe(PHOTO)
      expect(s.remaining).toBe(FREE - PHOTO)               // 둘을 합쳐 보여주지 않는다
    })
  })

})
