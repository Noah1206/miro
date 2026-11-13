import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { cardPaymentOrders, db } from '@miro/db'
import { firstPurchasePrice, rechargeProduct } from '@miro/config'
import { observe } from '@/lib/observe'
import { applyPaymentEvent } from './service'
import { purchasedProductIds } from './first-purchase'

/**
 * 카드 결제(11/13) — 포트원 V2 결제창 + KG이니시스 채널. 결제대행사는 포트원 콘솔의 채널로 고르고 채널 키만 넣는다.
 * env: PORTONE_STORE_ID·PORTONE_API_SECRET(본인인증과 같은 값), PORTONE_PAYMENT_CHANNEL_KEY(KG이니시스 채널), PORTONE_WEBHOOK_SECRET.
 * 지급은 포트원 API 로 결제를 다시 조회해 '결제 완료 + 주문 금액과 같음'일 때만, applyPaymentEvent 한 길로(이중 지급은 UNIQUE 가 막는다).
 */
export const CARD_PROVIDER = 'portone'
const API = 'https://api.portone.io'

export type CardConfig = { storeId: string; channelKey: string }
/** 브라우저에 줘도 되는 값만(상점 id·채널 키). API 비밀값·웹훅 비밀값은 서버에만. 셋 중 하나라도 없으면 카드 결제를 열지 않는다. */
export function cardPaymentConfig(): CardConfig | null {
  const { PORTONE_STORE_ID: storeId, PORTONE_PAYMENT_CHANNEL_KEY: channelKey, PORTONE_API_SECRET: secret, PORTONE_WEBHOOK_SECRET: hook } = process.env
  return storeId && channelKey && secret && hook ? { storeId, channelKey } : null
}

export class CardPaymentUnavailableError extends Error {}

const ORDER_NAME = (units: number) => `미로 토큰 ${units.toLocaleString('ko-KR')}개`

/**
 * 결제 전 주문. 금액(첫 구매 할인 포함)·지급량은 여기서 서버 카탈로그로 정한다. 같은 requestId 로 다시 오면 같은 주문을 돌려준다.
 * 지급하지 않는다 — 결제 확인(settleCardPayment) 뒤에만.
 */
export async function createCardOrder(opts: { userId: string; productId: string; requestId: string }) {
  const cfg = cardPaymentConfig()
  if (!cfg) throw new CardPaymentUnavailableError('CARD_PAYMENT_UNAVAILABLE')
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(opts.requestId)) throw new Error('INVALID_REQUEST_ID')
  const product = rechargeProduct(opts.productId)
  if (!product || product.currency !== 'KRW') throw new Error('RECHARGE_PRODUCT_UNAVAILABLE')
  const row = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'card-order:' + opts.userId}))`)
    const [prev] = await tx.select().from(cardPaymentOrders).where(eq(cardPaymentOrders.requestId, opts.requestId)).limit(1)
    if (prev) {
      if (prev.userId !== opts.userId || prev.productId !== product.id) throw new Error('ORDER_REQUEST_MISMATCH')
      return prev
    }
    const bought = await purchasedProductIds(opts.userId, tx)
    const amountMinor = bought.has(product.id) ? product.priceMinor : firstPurchasePrice(product.priceMinor)
    const [created] = await tx.insert(cardPaymentOrders).values({
      id: `rc-${opts.requestId}`, requestId: opts.requestId, userId: opts.userId, productId: product.id,
      amountMinor, currency: 'KRW', units: product.units,
    }).returning()
    return created!
  })
  if (row.status !== 'pending') throw new Error('ORDER_NOT_PENDING')
  observe('card_order.created', { userId: opts.userId, productId: product.id, amountMinor: row.amountMinor })
  return { ...cfg, paymentId: row.id, orderName: ORDER_NAME(row.units), totalAmount: row.amountMinor }
}

type PortOnePayment = { status?: string; id?: string; storeId?: string; transactionId?: string; currency?: string; amount?: { total?: number; cancelled?: number } }
async function fetchPayment(paymentId: string): Promise<PortOnePayment | null> {
  try {
    const res = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `PortOne ${process.env.PORTONE_API_SECRET}` }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) { observe('card_payment.lookup_failed', { paymentId, status: res.status }); return null }
    return await res.json() as PortOnePayment
  } catch (e) { observe('card_payment.lookup_failed', { paymentId, error: (e as Error).message }); return null }
}

/** 금액이 주문과 다른 결제는 받지 않고 바로 취소(환불)한다 — 결제창 금액을 바꿔치기한 경우. */
async function cancelPayment(paymentId: string, reason: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}/cancel`, { method: 'POST',
      headers: { Authorization: `PortOne ${process.env.PORTONE_API_SECRET}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason }), signal: AbortSignal.timeout(15_000) })
    return res.ok
  } catch { return false }
}

export type CardStatus = 'paid' | 'pending' | 'failed' | 'cancelled' | 'unknown'

/**
 * 결제 결과를 포트원에서 다시 받아 주문에 반영한다 — 브라우저 확인과 웹훅이 둘 다 부르고, 몇 번 불려도 결과가 같다.
 * userId 를 주면(브라우저 확인) 그 사용자의 주문만 본다.
 */
export async function settleCardPayment(paymentId: string, userId?: string): Promise<CardStatus> {
  if (!cardPaymentConfig() || typeof paymentId !== 'string' || paymentId.length > 80) return 'unknown'
  const [order] = await db.select().from(cardPaymentOrders).where(eq(cardPaymentOrders.id, paymentId)).limit(1)
  if (!order || (userId && order.userId !== userId)) return 'unknown'
  const p = await fetchPayment(paymentId)
  if (!p) return order.status === 'paid' || order.status === 'cancelled' ? order.status : 'pending'
  if (p.storeId && p.storeId !== process.env.PORTONE_STORE_ID) { observe('card_payment.store_mismatch', { paymentId }); return 'unknown' }
  const ref = `${CARD_PROVIDER}:${paymentId}`
  const raw = { source: 'portone', paymentId, transactionId: p.transactionId ?? null, status: p.status ?? null, amount: p.amount ?? null, currency: p.currency ?? null, orderAmount: order.amountMinor }

  if (p.status === 'PAID') {
    if (p.amount?.total !== order.amountMinor || !['KRW', 'CURRENCY_KRW'].includes(p.currency ?? '')) {
      const refunded = await cancelPayment(paymentId, '결제 금액이 주문 금액과 달라 자동 취소')
      await db.update(cardPaymentOrders).set({ status: 'failed', failureReason: refunded ? 'amount_mismatch_refunded' : 'amount_mismatch_refund_failed' })
        .where(eq(cardPaymentOrders.id, paymentId))
      observe('card_payment.amount_mismatch', { paymentId, paid: p.amount?.total ?? null, expected: order.amountMinor, refunded })
      return 'failed'
    }
    const r = await applyPaymentEvent(CARD_PROVIDER, { externalEventId: `${ref}:paid`, externalRef: ref, type: 'purchase', userId: order.userId,
      periodEnd: null, productId: order.productId, serverUnits: order.units, raw })
    if (r === 'unknown_user') return 'unknown'
    await db.update(cardPaymentOrders).set({ status: 'paid', paidAt: new Date(), pgTxId: p.transactionId ?? null, failureReason: null })
      .where(and(eq(cardPaymentOrders.id, paymentId), inArray(cardPaymentOrders.status, ['pending', 'failed'])))
    if (r === 'applied') observe('card_payment.paid', { paymentId, userId: order.userId, amountMinor: order.amountMinor })
    return 'paid'
  }
  if (p.status === 'CANCELLED' || p.status === 'PARTIAL_CANCELLED') {
    // ponytail: 부분 취소도 아직 안 쓴 충전분 전체를 회수한다(revokeRecharge) — 부분 환불을 운영에서 쓰게 되면 금액 비율 회수로 바꾼다.
    if (order.status === 'paid' || order.paidAt) {
      await applyPaymentEvent(CARD_PROVIDER, { externalEventId: `${ref}:cancel:${p.amount?.cancelled ?? 0}`, externalRef: ref, type: 'refund',
        userId: order.userId, periodEnd: null, productId: order.productId, raw })
    }
    await db.update(cardPaymentOrders).set({ status: 'cancelled', cancelledAt: new Date() }).where(eq(cardPaymentOrders.id, paymentId))
    observe('card_payment.cancelled', { paymentId, userId: order.userId })
    return 'cancelled'
  }
  if (p.status === 'FAILED') {
    await db.update(cardPaymentOrders).set({ status: 'failed', failureReason: 'pg_failed' })
      .where(and(eq(cardPaymentOrders.id, paymentId), eq(cardPaymentOrders.status, 'pending')))
    return 'failed'
  }
  return 'pending'
}

/**
 * 포트원 V2 웹훅 서명 확인(Standard Webhooks) — 비밀값 'whsec_…' 의 base64 본문을 키로, `${id}.${timestamp}.${body}` 의 HMAC-SHA256.
 * 5분보다 오래된 전송은 받지 않는다(재전송 공격). 성공하면 본문 JSON, 아니면 null.
 */
export function verifyPortOneWebhook(body: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, secret = process.env.PORTONE_WEBHOOK_SECRET, now = Date.now()): Record<string, unknown> | null {
  const { id, timestamp, signature } = headers
  if (!secret || !id || !timestamp || !signature) return null
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return null
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest()
  const ok = signature.split(' ').some(part => {
    const sig = Buffer.from(part.split(',')[1] ?? '', 'base64')
    return sig.length === expected.length && timingSafeEqual(sig, expected)
  })
  if (!ok) return null
  try { return JSON.parse(body) as Record<string, unknown> } catch { return null }
}
