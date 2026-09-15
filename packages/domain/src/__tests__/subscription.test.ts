import { describe, expect, it } from 'vitest'
import { applyExpiry, applyPurchase, applyRefund, isEntitled } from '../subscription/apply'
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
  it('a pass keeps entitlement until the period ends, then the sweep expires it', () => {
    const s = applyPurchase(null, now, 'ref')
    expect(isEntitled(s, new Date(now.getTime() + 5 * day))).toBe(true)
    const e = applyExpiry(s, new Date(s.currentPeriodEnd.getTime() + 1))
    expect(e.status).toBe('expired'); expect(isEntitled(e, new Date(s.currentPeriodEnd.getTime() + 1))).toBe(false)
  })
  it('a purchase never renews itself, so the sweep can always reach it', () => {
    // renewalStatus 가 'auto' 로 남으면 expireSubscriptions 의 대상에서 빠져 기간이 지나도 Pro 가 유지된다.
    expect(applyPurchase(null, now, 'ref').renewalStatus).toBe('cancelled')
  })
  it('the sweep leaves a pass alone while its period is still running', () => {
    const s = applyPurchase(null, now, 'ref'); expect(applyExpiry(s, new Date(now.getTime() + day)).status).toBe('active')
  })
  it('refund ends entitlement immediately', () => { expect(isEntitled(applyRefund(applyPurchase(null, now, 'ref'), now), now)).toBe(false) })
  it('no subscription → not entitled', () => { expect(isEntitled(null, now)).toBe(false) })
})
