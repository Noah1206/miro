import { POLICY } from '@miro/config'

export type Subscription = {
  status: 'active' | 'cancelled' | 'expired'
  renewalStatus: 'auto' | 'cancelled'
  currentPeriodStart: Date
  currentPeriodEnd: Date
  externalRef: string | null
}

/** 해지 후에도 현재 결제 기간 종료까지 Pro 자격을 유지한다 (명세서 10.3). */
export function isEntitled(sub: Subscription | null, now: Date): boolean {
  if (!sub) return false
  return sub.status !== 'expired' && sub.currentPeriodEnd > now
}

/** 구매/갱신 적용. 기간이 남아 있으면 그 끝에서 이어 붙이고, 아니면 지금부터 시작한다. */
export function applyPurchase(sub: Subscription | null, now: Date, externalRef: string, periodEnd?: Date): Subscription {
  const base = sub && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now
  const end = periodEnd ?? new Date(base.getTime() + POLICY.subscription.periodDays * 86_400_000)
  return { status: 'active', renewalStatus: 'auto', currentPeriodStart: sub && sub.currentPeriodEnd > now ? sub.currentPeriodStart : now, currentPeriodEnd: end, externalRef }
}

/** 해지: 즉시 자격을 빼앗지 않는다. 갱신만 멈춘다. */
export function applyCancel(sub: Subscription): Subscription {
  return { ...sub, status: 'cancelled', renewalStatus: 'cancelled' }
}

/** 기간이 끝났고 갱신이 없으면 만료. Cron 이 호출한다. */
export function applyExpiry(sub: Subscription, now: Date): Subscription {
  if (sub.currentPeriodEnd <= now && sub.renewalStatus === 'cancelled') return { ...sub, status: 'expired' }
  return sub
}

/** 환불: 자격을 즉시 종료한다. */
export function applyRefund(sub: Subscription, now: Date): Subscription {
  return { ...sub, status: 'expired', renewalStatus: 'cancelled', currentPeriodEnd: now }
}
