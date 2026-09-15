import { POLICY } from '@miro/config'

export type Subscription = {
  status: 'active' | 'cancelled' | 'expired'
  renewalStatus: 'auto' | 'cancelled'
  currentPeriodStart: Date
  currentPeriodEnd: Date
  externalRef: string | null
}

/** 기간이 끝나기 전까지 Pro 자격을 유지한다. 만료된 이용권은 자격이 없다. */
export function isEntitled(sub: Subscription | null, now: Date): boolean {
  if (!sub) return false
  return sub.status !== 'expired' && sub.currentPeriodEnd > now
}

/**
 * 이용권 구매 적용. 기간이 남아 있으면 그 끝에서 이어 붙이고, 아니면 지금부터 시작한다.
 *
 * **자동 갱신은 없다.** 한 번 산 이용권은 기간이 끝나면 만료되고, 이어가려면 다시 산다.
 * 그래서 `renewalStatus` 는 항상 `cancelled` — 만료 sweep 이 이 값으로 대상을 고르므로
 * `auto` 로 두면 기간이 지나도 영영 만료되지 않고 Pro 자격이 남는다.
 */
export function applyPurchase(sub: Subscription | null, now: Date, externalRef: string, periodEnd?: Date): Subscription {
  const base = sub && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now
  const end = periodEnd ?? new Date(base.getTime() + POLICY.subscription.periodDays * 86_400_000)
  return { status: 'active', renewalStatus: 'cancelled', currentPeriodStart: sub && sub.currentPeriodEnd > now ? sub.currentPeriodStart : now, currentPeriodEnd: end, externalRef }
}

/** 기간이 끝나면 만료. Cron 이 호출한다. 갱신이 없으므로 모든 이용권이 여기를 지난다. */
export function applyExpiry(sub: Subscription, now: Date): Subscription {
  if (sub.currentPeriodEnd <= now && sub.renewalStatus === 'cancelled') return { ...sub, status: 'expired' }
  return sub
}

/** 환불: 자격을 즉시 종료한다. */
export function applyRefund(sub: Subscription, now: Date): Subscription {
  return { ...sub, status: 'expired', renewalStatus: 'cancelled', currentPeriodEnd: now }
}
