import { and, desc, eq, gt, lte } from 'drizzle-orm'
import { POLICY } from '@miro/config'
import { db, paymentEvents, subscriptions, usageWindows } from '@miro/db'
import { applyCancel, applyExpiry, applyPurchase, applyRefund, isEntitled, type Subscription } from '@miro/domain'
import { resolvePayment, type PaymentEvent } from '@miro/providers'
import { observe } from '@/lib/observe'
import { track } from '@/lib/analytics/track'

export async function startCheckout(userId: string) {
  const provider = resolvePayment()
  const checkout = await provider.createCheckout({ userId, plan: 'pro' })
  observe('payment.checkout_started', { userId, provider: provider.name })
  return { ...checkout, provider: provider.name, notice: provider.info.notice }
}

/**
 * 결제 이벤트 적용 — webhook 과 Mock 시뮬레이션이 같은 경로를 탄다.
 * (provider, externalEventId) UNIQUE 로 중복 webhook 은 한 번만 적용된다.
 * 결제 결과 확인이 지연되어도 자격은 확인 완료 후에만 갱신된다 (명세서 10.2 예외).
 */
export async function applyPaymentEvent(providerName: string, ev: PaymentEvent): Promise<'applied' | 'duplicate' | 'unknown_user'> {
  const now = new Date()
  return db.transaction(async (tx) => {
    // 트랜잭션 안에서 UNIQUE 위반이 나면 트랜잭션 전체가 abort 되므로 먼저 조회한다.
    // 동시 재전송 레이스는 UNIQUE 인덱스가 막고, 그 경우 PG 의 재시도가 여기서 duplicate 를 본다.
    const [seen] = await tx.select({ id: paymentEvents.id }).from(paymentEvents)
      .where(and(eq(paymentEvents.provider, providerName), eq(paymentEvents.externalEventId, ev.externalEventId))).limit(1)
    if (seen) { observe('payment.duplicate_prevented', { provider: providerName, eventId: ev.externalEventId }); return 'duplicate' }
    await tx.insert(paymentEvents).values({
      userId: ev.userId, provider: providerName, externalEventId: ev.externalEventId, externalRef: ev.externalRef,
      type: ev.type, periodEnd: ev.periodEnd, payload: ev.raw,
    })

    // 사용자 연결: 이벤트에 없으면 externalRef 로 기존 구독을 찾는다 (갱신/해지 webhook).
    let userId = ev.userId
    if (!userId) {
      const [bySub] = await tx.select({ userId: subscriptions.userId }).from(subscriptions).where(eq(subscriptions.externalRef, ev.externalRef)).limit(1)
      userId = bySub?.userId ?? null
    }
    if (!userId) { observe('payment.unknown_user', { provider: providerName, ref: ev.externalRef }); return 'unknown_user' }

    const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1)
    const current: Subscription | null = row ? { status: row.status, renewalStatus: row.renewalStatus, currentPeriodStart: row.currentPeriodStart, currentPeriodEnd: row.currentPeriodEnd, externalRef: row.externalRef } : null

    let next: Subscription | null = null
    if (ev.type === 'purchase' || ev.type === 'renewal') next = applyPurchase(current, now, ev.externalRef, ev.periodEnd ?? undefined)
    else if (ev.type === 'cancel' && current) next = applyCancel(current)
    else if (ev.type === 'refund' && current) next = applyRefund(current, now)
    else if (ev.type === 'failed') { observe('payment.failed', { userId, provider: providerName }); return 'applied' }
    if (!next) return 'applied'

    await tx.insert(subscriptions).values({ userId, plan: 'pro', provider: providerName, ...next, updatedAt: now })
      .onConflictDoUpdate({ target: subscriptions.userId, set: { provider: providerName, ...next, updatedAt: now } })

    if (ev.type === 'purchase' || ev.type === 'renewal') {
      // 방금 한도에 막혀 결제한 사용자가 바로 이어갈 수 있도록 현재 창의 한도를 Pro 로 올린다.
      await tx.update(usageWindows).set({ plan: 'pro', limit: POLICY.usage.limits.pro })
        .where(and(eq(usageWindows.userId, userId), gt(usageWindows.endsAt, now)))
      void track(userId, 'subscription_started', { provider: providerName, type: ev.type })
    }
    observe('payment.applied', { userId, provider: providerName, type: ev.type })
    return 'applied'
  })
}

/** 재설치/기기 변경 후 복원. Provider 의 구매 이력에서 찾아 자격을 계정에 다시 연결한다. */
export async function restorePurchase(userId: string): Promise<'restored' | 'nothing'> {
  const provider = resolvePayment()
  const found = await provider.restore({ userId })
  if (!found || found.periodEnd <= new Date()) return 'nothing'
  const r = await applyPaymentEvent(provider.name, {
    externalEventId: `restore:${found.externalRef}:${found.periodEnd.toISOString()}`, externalRef: found.externalRef,
    type: 'purchase', userId, periodEnd: found.periodEnd, raw: { restored: true },
  })
  return r === 'unknown_user' ? 'nothing' : 'restored'
}

/** 해지. 현재 결제 기간이 끝날 때까지 Pro 를 유지한다. */
export async function cancelSubscription(userId: string): Promise<boolean> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1)
  if (!row || row.status !== 'active') return false
  if (row.externalRef) await resolvePayment().cancel(row.externalRef).catch(() => {})
  await db.update(subscriptions).set({ ...applyCancel(row as never), updatedAt: new Date() }).where(eq(subscriptions.userId, userId))
  observe('payment.cancelled', { userId })
  return true
}

export async function subscriptionStatus(userId: string) {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1)
  if (!row) return null
  return { ...row, entitled: isEntitled(row as never, new Date()) }
}

/** 기간이 끝났고 갱신이 없는 구독을 만료 처리한다. Cron 에서 호출. */
export async function expireSubscriptions(now = new Date()): Promise<number> {
  const due = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.renewalStatus, 'cancelled'), lte(subscriptions.currentPeriodEnd, now), eq(subscriptions.status, 'cancelled')))
  for (const s of due) {
    await db.update(subscriptions).set({ ...applyExpiry(s as never, now), updatedAt: now }).where(eq(subscriptions.id, s.id))
  }
  return due.length
}
export { desc }
