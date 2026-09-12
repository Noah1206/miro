import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, paymentEvents, subscriptions, usageWindows, users } from '@miro/db'
import { POLICY } from '@miro/config'
import { applyPaymentEvent, cancelSubscription, expireSubscriptions, restorePurchase, subscriptionStatus } from '../service'
import { effectivePlan, reserve } from '@/lib/usage/guard'
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
})
