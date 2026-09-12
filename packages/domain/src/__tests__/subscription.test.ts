import { describe, expect, it } from 'vitest'
import { applyCancel, applyExpiry, applyPurchase, applyRefund, isEntitled } from '../subscription/apply'
import { POLICY } from '@miro/config'
const now = new Date('2026-09-12T00:00:00Z')
const day = 86_400_000
describe('subscription rules', () => {
  it('a purchase starts a period now', () => {
    const s = applyPurchase(null, now, 'ref'); expect(s.status).toBe('active'); expect(s.currentPeriodEnd.getTime()).toBe(now.getTime() + POLICY.subscription.periodDays * day)
  })
  it('a renewal extends from the current end, not from now', () => {
    const first = applyPurchase(null, now, 'ref'); const mid = new Date(now.getTime() + 10 * day)
    const r = applyPurchase(first, mid, 'ref'); expect(r.currentPeriodEnd.getTime()).toBe(first.currentPeriodEnd.getTime() + POLICY.subscription.periodDays * day)
  })
  it('cancel keeps entitlement until the period ends, then expiry removes it', () => {
    const c = applyCancel(applyPurchase(null, now, 'ref')); expect(c.renewalStatus).toBe('cancelled')
    expect(isEntitled(c, new Date(now.getTime() + 5 * day))).toBe(true)
    const e = applyExpiry(c, new Date(c.currentPeriodEnd.getTime() + 1)); expect(e.status).toBe('expired'); expect(isEntitled(e, new Date(c.currentPeriodEnd.getTime() + 1))).toBe(false)
  })
  it('an auto-renewing subscription is not expired by the sweep', () => {
    const s = applyPurchase(null, now, 'ref'); expect(applyExpiry(s, new Date(s.currentPeriodEnd.getTime() + day)).status).toBe('active')
  })
  it('refund ends entitlement immediately', () => { expect(isEntitled(applyRefund(applyPurchase(null, now, 'ref'), now), now)).toBe(false) })
  it('no subscription → not entitled', () => { expect(isEntitled(null, now)).toBe(false) })
})
