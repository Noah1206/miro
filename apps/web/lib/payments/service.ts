import { mockProvidersAllowed, productionRuntime } from '@miro/config'
import { and, desc, eq, gt, lte, ne } from 'drizzle-orm'
import { usagePolicy, rechargeProduct, POLICY } from '@miro/config'
import { db, paymentEvents, subscriptions, usageWindows } from '@miro/db'
import { applyExpiry, applyPurchase, applyRefund, isEntitled, type Subscription } from '@miro/domain'
import { resolvePayment, type PaymentEvent } from '@miro/providers'
import { grantRecharge, revokeRecharge } from '@/lib/usage/guard'
import { observe } from '@/lib/observe'
import { track } from '@/lib/analytics/track'

export async function startCheckout(userId: string) {
  if (productionRuntime()) throw new Error('BILLING_NOT_RELEASED')
  const provider = resolvePayment()
  const checkout = await provider.createCheckout({ userId, plan: 'pro' })
  observe('payment.checkout_started', { userId, provider: provider.name })
  return { ...checkout, provider: provider.name, notice: provider.info.notice }
}

/**
 * 충전 결제 시작. 가격은 서버 카탈로그에서만 온다 — 브라우저는 상품 id 만 보낸다.
 *
 * 상품이 없거나 Provider 가 충전 결제를 구현하지 않았으면 판매하지 않는다.
 * 여기서 잔액이 늘지는 않는다 — 지급은 검증된 결제 결과가 도착한 뒤다.
 */
export async function startRechargeCheckout(userId: string, productId: string) {
  if (productionRuntime()) throw new Error('BILLING_NOT_RELEASED')
  const product = rechargeProduct(productId)
  if (!product) throw new Error('RECHARGE_PRODUCT_UNAVAILABLE')
  const provider = resolvePayment()
  if (!provider.createRechargeCheckout) throw new Error('RECHARGE_PRODUCT_UNAVAILABLE')
  const checkout = await provider.createRechargeCheckout({
    userId, productId: product.id, priceMinor: product.priceMinor, currency: product.currency,
  })
  observe('payment.recharge_checkout_started', { userId, provider: provider.name, productId: product.id })
  return { ...checkout, provider: provider.name, notice: provider.info.notice }
}

/**
 * 결제 이벤트 적용 — webhook 과 Mock 시뮬레이션이 같은 경로를 탄다.
 * (provider, externalEventId) UNIQUE 로 중복 webhook 은 한 번만 적용된다.
 * 결제 결과 확인이 지연되어도 자격은 확인 완료 후에만 갱신된다 (명세서 10.2 예외).
 */
export async function applyPaymentEvent(providerName: string, ev: PaymentEvent): Promise<'applied' | 'duplicate' | 'unknown_user'> {
  if (providerName === 'mock' && !mockProvidersAllowed()) throw new Error('MOCK_PAYMENT_DISABLED')
  const now = new Date()
  /** 충전 지급은 이벤트 기록이 커밋된 뒤에 한다 — 기록이 롤백되면 잔액도 늘지 않는다. */
  const deferred: { ev: PaymentEvent; userId: string | null }[] = []
  const result = await db.transaction(async (tx) => {
    // 트랜잭션 안에서 UNIQUE 위반이 나면 트랜잭션 전체가 abort 되므로 먼저 조회한다.
    // 동시 재전송 레이스는 UNIQUE 인덱스가 막고, 그 경우 PG 의 재시도가 여기서 duplicate 를 본다.
    const [seen] = await tx.select({ id: paymentEvents.id }).from(paymentEvents)
      .where(and(eq(paymentEvents.provider, providerName), eq(paymentEvents.externalEventId, ev.externalEventId))).limit(1)
    if (seen) { observe('payment.duplicate_prevented', { provider: providerName, eventId: ev.externalEventId }); return 'duplicate' }
    await tx.insert(paymentEvents).values({
      userId: ev.userId, provider: providerName, externalEventId: ev.externalEventId, externalRef: ev.externalRef,
      type: ev.type, periodEnd: ev.periodEnd, payload: ev.raw,
    })

    // 충전 구매는 구독과 다른 길로 간다 — 잔액만 늘리고 Pro 자격은 건드리지 않는다.
    if (ev.productId) { deferred.push({ ev, userId: ev.userId }); return 'applied' }

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
    // 이용권은 자동 갱신이 없다. 외부에서 온 취소는 멈출 갱신이 없으므로 상태만 남기고
    // 자격은 기간 끝까지 유지한다 — 환불(applyRefund)만 자격을 즉시 끊는다.
    else if (ev.type === 'cancel' && current) next = { ...current, status: 'cancelled' }
    else if (ev.type === 'refund' && current) next = applyRefund(current, now)
    else if (ev.type === 'failed') { observe('payment.failed', { userId, provider: providerName }); return 'applied' }
    if (!next) return 'applied'

    // 새 기간이 시작되면 지난 만료 안내를 비운다 — 다음 만료도 다시 알려야 한다.
    const notice = ev.type === 'purchase' || ev.type === 'renewal' ? { expiryNotice: null } : {}
    await tx.insert(subscriptions).values({ userId, plan: 'pro', provider: providerName, ...next, ...notice, updatedAt: now })
      .onConflictDoUpdate({ target: subscriptions.userId, set: { provider: providerName, ...next, ...notice, updatedAt: now } })

    if (ev.type === 'purchase' || ev.type === 'renewal') {
      // 방금 한도에 막혀 결제한 사용자가 바로 이어갈 수 있도록 현재 창의 한도를 Pro 로 올린다.
      await tx.update(usageWindows).set({ plan: 'pro', limit: usagePolicy().monthly.pro })
        .where(and(eq(usageWindows.userId, userId), gt(usageWindows.endsAt, now)))
      void track(userId, 'subscription_started', { provider: providerName, type: ev.type })
    }
    observe('payment.applied', { userId, provider: providerName, type: ev.type })
    return 'applied'
  })
  const recharge = deferred[0]
  if (recharge) return applyRechargeEvent(providerName, recharge.ev, recharge.userId)
  return result
}

/**
 * 충전 결제 결과 적용. 지급량은 이벤트가 아니라 서버 카탈로그의 상품에서 읽는다 —
 * 위조된 webhook 이 수량을 부풀릴 수 없다.
 *
 * 성공이 아니면 아무것도 지급하지 않고, 환불·취소는 아직 쓰지 않은 잔액만 회수한다.
 * 같은 결제(provider, externalRef)로는 한 번만 지급된다 — DB UNIQUE 가 보장한다.
 */
async function applyRechargeEvent(providerName: string, ev: PaymentEvent, userId: string | null): Promise<'applied' | 'unknown_user'> {
  if (!userId) { observe('payment.unknown_user', { provider: providerName, ref: ev.externalRef }); return 'unknown_user' }
  if (ev.type === 'refund' || ev.type === 'cancel') {
    const { revoked } = await revokeRecharge(providerName, ev.externalRef)
    observe('recharge.revoked', { userId, provider: providerName, ref: ev.externalRef, revoked })
    return 'applied'
  }
  if (ev.type !== 'purchase') { observe('payment.failed', { userId, provider: providerName }); return 'applied' }

  const product = rechargeProduct(ev.productId!)
  if (!product) { observe('recharge.unknown_product', { userId, provider: providerName, productId: ev.productId }); return 'applied' }
  const { granted } = await grantRecharge({
    userId, amount: product.units, source: 'purchase',
    provider: providerName, externalRef: ev.externalRef,
    expiresAt: product.validDays ? new Date(Date.now() + product.validDays * 86_400_000) : null,
  })
  if (granted) {
    observe('recharge.granted', { userId, provider: providerName, productId: product.id, units: product.units })
    void track(userId, 'recharge_purchased', { provider: providerName, productId: product.id, units: product.units })
  }
  return 'applied'
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

export async function subscriptionStatus(userId: string) {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1)
  if (!row) return null
  return { ...row, entitled: isEntitled(row as never, new Date()) }
}

/**
 * 기간이 끝난 이용권을 만료 처리한다. Cron 에서 호출.
 *
 * 자동 갱신이 없으므로 `active` 인 이용권도 기간이 지나면 여기서 끝난다 — 해지를 기다리지
 * 않는다. 이미 `expired` 인 행만 건너뛴다.
 */
export async function expireSubscriptions(now = new Date()): Promise<number> {
  const due = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.renewalStatus, 'cancelled'), lte(subscriptions.currentPeriodEnd, now), ne(subscriptions.status, 'expired')))
  for (const s of due) {
    await db.update(subscriptions).set({ ...applyExpiry(s as never, now), updatedAt: now }).where(eq(subscriptions.id, s.id))
  }
  return due.length
}
export { desc }
