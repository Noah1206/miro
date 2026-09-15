import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, paymentEvents, subscriptions, usageWindows, users } from '@miro/db'
import { POLICY } from '@miro/config'
import { applyPaymentEvent, cancelSubscription, expireSubscriptions, restorePurchase, startRechargeCheckout, subscriptionStatus } from '../service'
import { effectivePlan, rechargeBalance, rechargeHistory, reserve } from '@/lib/usage/guard'
import { resolvePayment } from '@miro/providers'
const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const ev = (userId: string, over: Partial<Parameters<typeof applyPaymentEvent>[1]> = {}) => ({
  externalEventId: `evt_${randomBytes(4).toString('hex')}`, externalRef: `sub_${userId}`, type: 'purchase' as const, userId, periodEnd: null, raw: {}, ...over,
})
describeDb('payments', () => {
  const made: string[] = []
  async function user() { const [u] = await db.insert(users).values({ email: `py-${randomBytes(5).toString('hex')}@miro.dev` }).returning(); made.push(u!.id); return u!.id }
  afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })

  it('Scenario 3 tail: a purchase grants Pro and lifts the current window so the user continues at once', async () => {
    const u = await user()
    await reserve({ userId: u, kind: 'textRP', idempotencyKey: `k:${u}` })
    await db.update(usageWindows).set({ consumed: POLICY.usage.limits.free }).where(eq(usageWindows.userId, u))
    await expect(reserve({ userId: u, kind: 'textRP', idempotencyKey: `k2:${u}` })).rejects.toThrow('usage limit')

    expect(await applyPaymentEvent('mock', ev(u))).toBe('applied')
    expect(await effectivePlan(u)).toBe('pro')
    const [w] = await db.select().from(usageWindows).where(eq(usageWindows.userId, u)); expect(w!.limit).toBe(POLICY.usage.limits.pro)
    await expect(reserve({ userId: u, kind: 'textRP', idempotencyKey: `k3:${u}` })).resolves.toBeTruthy()
  })

  it('the same webhook twice applies once', async () => {
    const u = await user(); const e = ev(u)
    expect(await applyPaymentEvent('mock', e)).toBe('applied'); expect(await applyPaymentEvent('mock', e)).toBe('duplicate')
    expect(await db.select().from(paymentEvents).where(eq(paymentEvents.userId, u))).toHaveLength(1)
    expect(await db.select().from(subscriptions).where(eq(subscriptions.userId, u))).toHaveLength(1)
  })

  it('a failed payment grants nothing', async () => {
    const u = await user(); await applyPaymentEvent('mock', ev(u, { type: 'failed' })); expect(await effectivePlan(u)).toBe('free')
  })

  it('cancel keeps Pro until the period ends; the sweep expires it after', async () => {
    const u = await user(); await applyPaymentEvent('mock', ev(u))
    expect(await cancelSubscription(u)).toBe(true)
    const s = await subscriptionStatus(u); expect(s!.status).toBe('cancelled'); expect(s!.entitled).toBe(true); expect(await effectivePlan(u)).toBe('pro')
    expect(await expireSubscriptions(new Date())).toBe(0)
    const after = new Date(s!.currentPeriodEnd.getTime() + 1000)
    expect(await expireSubscriptions(after)).toBeGreaterThanOrEqual(1); expect(await effectivePlan(u, after)).toBe('free')
  })

  it('a renewal webhook with no user id is matched through the subscription ref', async () => {
    const u = await user(); await applyPaymentEvent('mock', ev(u))
    const before = (await subscriptionStatus(u))!.currentPeriodEnd
    expect(await applyPaymentEvent('mock', { ...ev(u, { type: 'renewal' }), userId: null })).toBe('applied')
    expect((await subscriptionStatus(u))!.currentPeriodEnd.getTime()).toBeGreaterThan(before.getTime())
  })

  it('restore reattaches a purchase the provider knows about, and reports nothing otherwise', async () => {
    const u = await user()
    expect(await restorePurchase(u)).toBe('nothing')
    const p = resolvePayment()
    const e = await p.parseWebhook(JSON.stringify({ checkoutId: `mockco_${u}_x`, outcome: 'success' }), `mock:${u}`)
    await applyPaymentEvent(p.name, e!)
    await db.delete(subscriptions).where(eq(subscriptions.userId, u))          // "재설치": 계정에서 자격이 사라짐
    expect(await effectivePlan(u)).toBe('free')
    expect(await restorePurchase(u)).toBe('restored'); expect(await effectivePlan(u)).toBe('pro')
  })

  it('a webhook with a bad signature is rejected by the provider', async () => {
    const u = await user()
    expect(await resolvePayment().parseWebhook(JSON.stringify({ checkoutId: `mockco_${u}_x`, outcome: 'success' }), 'mock:someone-else')).toBeNull()
    expect(await resolvePayment().parseWebhook('not json', `mock:${u}`)).toBeNull()
  })

  /** 5단계 — 충전 결제 연동. */
  describe('recharge purchases', () => {
    const CATALOG = JSON.stringify([{ id: 'pack_s', name: '작은 충전', units: 50, priceMinor: 1900, currency: 'KRW' }])
    const rc = (userId: string, over: Record<string, unknown> = {}) => ({
      externalEventId: `rcevt_${randomBytes(4).toString('hex')}`, externalRef: `rc_${userId}_${randomBytes(3).toString('hex')}`,
      type: 'purchase' as const, userId, periodEnd: null, productId: 'pack_s', raw: {}, ...over,
    })
    afterEach(() => vi.unstubAllEnvs())

    it('a verified purchase grants the units the server catalog names', async () => {
      vi.stubEnv('MIRO_RECHARGE_PRODUCTS', CATALOG)
      const u = await user()
      expect(await applyPaymentEvent('mock', rc(u))).toBe('applied')
      expect(await rechargeBalance(u)).toBe(50)
      // 충전은 구독이 아니다 — Pro 자격을 주지 않는다.
      expect(await effectivePlan(u)).toBe('free')
      expect(await subscriptionStatus(u)).toBeNull()
    })

    it('a forged amount in the event cannot inflate the grant', async () => {
      vi.stubEnv('MIRO_RECHARGE_PRODUCTS', CATALOG)
      const u = await user()
      // 위조된 webhook 이 수량을 실어 보내도 카탈로그 값만 지급된다.
      await applyPaymentEvent('mock', rc(u, { raw: { units: 999_999, amount: 999_999 } }))
      expect(await rechargeBalance(u)).toBe(50)
    })

    it('an unknown product grants nothing', async () => {
      vi.stubEnv('MIRO_RECHARGE_PRODUCTS', CATALOG)
      const u = await user()
      await applyPaymentEvent('mock', rc(u, { productId: 'pack_does_not_exist' }))
      expect(await rechargeBalance(u)).toBe(0)
    })

    it('a failed payment grants nothing', async () => {
      vi.stubEnv('MIRO_RECHARGE_PRODUCTS', CATALOG)
      const u = await user()
      await applyPaymentEvent('mock', rc(u, { type: 'failed' }))
      expect(await rechargeBalance(u)).toBe(0)
    })

    it('a duplicate webhook is applied once', async () => {
      vi.stubEnv('MIRO_RECHARGE_PRODUCTS', CATALOG)
      const u = await user()
      const event = rc(u)
      expect(await applyPaymentEvent('mock', event)).toBe('applied')
      expect(await applyPaymentEvent('mock', event)).toBe('duplicate')
      expect(await rechargeBalance(u)).toBe(50)
    })

    it('a resent payment under a new event id still grants only once', async () => {
      vi.stubEnv('MIRO_RECHARGE_PRODUCTS', CATALOG)
      const u = await user()
      const ref = `rc_${u}_same`
      await applyPaymentEvent('mock', rc(u, { externalRef: ref }))
      // 지연·재전송으로 이벤트 id 만 다른 같은 결제가 또 와도 잔액은 한 번만 늘어난다.
      await applyPaymentEvent('mock', rc(u, { externalRef: ref }))
      expect(await rechargeBalance(u)).toBe(50)
    })

    it('a refund takes back only what is unused, even arriving out of order', async () => {
      vi.stubEnv('MIRO_RECHARGE_PRODUCTS', CATALOG)
      const u = await user()
      const ref = `rc_${u}_refund`
      // 환불이 결제보다 먼저 도착해도 없는 잔액을 깎지 않는다.
      await applyPaymentEvent('mock', rc(u, { externalRef: ref, type: 'refund' }))
      expect(await rechargeBalance(u)).toBe(0)

      await applyPaymentEvent('mock', rc(u, { externalRef: ref }))
      expect(await rechargeBalance(u)).toBe(50)
      // 월간을 비우고 충전에서 10 을 쓴 뒤 환불한다.
      await reserve({ userId: u, kind: 'photo', units: POLICY.usage.limits.free / POLICY.usage.weights.photo, idempotencyKey: `drain:${u}` })
      await reserve({ userId: u, kind: 'photo', idempotencyKey: `spend:${u}` })
      await applyPaymentEvent('mock', rc(u, { externalRef: ref, type: 'refund' }))
      expect(await rechargeBalance(u)).toBe(0)
      const [h] = await rechargeHistory(u)
      expect(h!.status).toBe('revoked')
    })

    it('refuses to sell a product the server catalog does not list', async () => {
      vi.stubEnv('MIRO_RECHARGE_PRODUCTS', CATALOG)
      const u = await user()
      await expect(startRechargeCheckout(u, 'pack_forged')).rejects.toThrow('RECHARGE_PRODUCT_UNAVAILABLE')
      const c = await startRechargeCheckout(u, 'pack_s')
      expect(c.checkoutId).toContain('pack_s')
    })

    it('sells nothing while no catalog is configured', async () => {
      vi.stubEnv('MIRO_RECHARGE_PRODUCTS', '')
      const u = await user()
      await expect(startRechargeCheckout(u, 'pack_s')).rejects.toThrow('RECHARGE_PRODUCT_UNAVAILABLE')
    })

    it('does not open sales in production even with a catalog configured', async () => {
      vi.stubEnv('MIRO_RECHARGE_PRODUCTS', CATALOG)
      vi.stubEnv('VERCEL_ENV', 'production')
      const u = await user()
      await expect(startRechargeCheckout(u, 'pack_s')).rejects.toThrow('BILLING_NOT_RELEASED')
    })
  })

})
