import { randomBytes } from 'node:crypto'
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { db, bankTelegramRequests, bankTransferOrders } from '@miro/db'
import { BANK_TRANSFER_WINDOW_HOURS, POLICY, bankAccount, firstPurchasePrice, rechargeProduct } from '@miro/config'
import { observe } from '@/lib/observe'
import { applyPaymentEvent } from './service'
import { afterResponse } from '@/lib/defer'
import { postOperatorNote } from '@/lib/ops/alerts'
import { telegramPaymentConfig } from './telegram-config'
import { telegramCall } from './telegram-api'

/** 계좌이체 Provider 이름. payment_events 에 이 이름으로 남아 다른 결제와 섞이지 않는다. */
export const BANK_PROVIDER = 'bank_transfer'

export type OrderKind = 'pass' | 'recharge'

/**
 * 대조 코드. 입금자명만으로는 동명이인·같은 금액을 가를 수 없어 사용자가 이름 뒤에 붙인다.
 * 헷갈리는 글자(0/O, 1/I)를 뺀 6자리 — 사람이 계좌이체 화면에 옮겨 적는 값이기 때문이다.
 */
function referenceCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(randomBytes(6), b => alphabet[b % alphabet.length]).join('')
}

export class BankTransferUnavailableError extends Error {}
export class OrderPendingError extends Error {}

/**
 * 입금 대기 주문 생성. **지급하지 않는다** — 운영자가 실제 입금을 확인해 승인해야 한다.
 *
 * 금액과 지급량은 서버 카탈로그에서만 온다. 브라우저는 무엇을 살지만 고른다.
 */
export async function createBankOrder(opts: {
  userId: string; kind: OrderKind; productId?: string; depositorName?: string; now?: Date; requestId?: string
}): Promise<{ id: string; referenceCode: string; amountMinor: number; currency: string; expiresAt: Date }> {
  if (opts.requestId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(opts.requestId)) throw new Error('INVALID_REQUEST_ID')
  // Reuse the order primary key as the durable request key, including after settlement.
  const previous = async (reader: Pick<typeof db, 'select'>) => {
    if (!opts.requestId) return null
    const [o] = await reader.select().from(bankTransferOrders).where(eq(bankTransferOrders.id, opts.requestId)).limit(1)
    if (o && (o.userId !== opts.userId || o.kind !== opts.kind || o.productId !== (opts.productId ?? null))) throw new Error('ORDER_REQUEST_MISMATCH')
    return o ?? null
  }
  const existing = await previous(db)
  if (existing) return existing
  // Already-issued pass orders can still be replayed/settled; new checkout purchases tokens only.
  if (opts.kind === 'pass') throw new BankTransferUnavailableError('PASS_SALES_ENDED')
  const account = bankAccount()
  if (!account) throw new BankTransferUnavailableError('BANK_TRANSFER_UNAVAILABLE')

  // 입금자명을 따로 묻지 않으면 대조 코드를 입금자명으로 쓴다 — 입금은 그 코드로 찾는다.
  const code = referenceCode()
  const depositorName = (opts.depositorName ?? '').trim() || code
  if (depositorName.length > 40) throw new Error('INVALID_DEPOSITOR_NAME')

  let amountMinor: number, currency: string, units: number | null, productId: string | null
  if (opts.kind === 'recharge') {
    const product = opts.productId ? rechargeProduct(opts.productId) : null
    if (!product) throw new Error('RECHARGE_PRODUCT_UNAVAILABLE')
    if (product.currency !== 'KRW') throw new Error('RECHARGE_CURRENCY_UNSUPPORTED')
    ;({ priceMinor: amountMinor, currency } = product)
    units = product.units; productId = product.id
  } else {
    // 이용권 가격은 정책에 있고 지급량은 자격이라 units 가 없다.
    amountMinor = POLICY.subscription.priceKRW; currency = 'KRW'; units = null; productId = null
  }

  const now = opts.now ?? new Date()
  const expiresAt = new Date(now.getTime() + BANK_TRANSFER_WINDOW_HOURS * 3600_000)
  // 기한이 지난 내 주문은 먼저 정리한다 — 하나만 대기하도록 막혀 새 주문을 못 넣는 일이 없게.
  try {
    const result = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'bank-order:' + opts.userId}))`)
      const replay = await previous(tx)
      if (replay) return { row: replay, created: false }
      await tx.update(bankTransferOrders).set({ status: 'expired' }).where(and(
        eq(bankTransferOrders.userId, opts.userId), eq(bankTransferOrders.status, 'awaiting'), lt(bankTransferOrders.expiresAt, now)))
      const [pending] = await tx.select({ id: bankTransferOrders.id }).from(bankTransferOrders).where(and(
        eq(bankTransferOrders.userId, opts.userId), or(eq(bankTransferOrders.status, 'awaiting'),
          and(eq(bankTransferOrders.status, 'approved'), isNull(bankTransferOrders.settledAt))))).limit(1)
      if (pending) throw new OrderPendingError('ORDER_ALREADY_PENDING')
      // 11/12 상품마다 첫 구매 한 번은 할인(정가의 6/7) — 승인된 같은 상품 주문이 없을 때만. 금액은 여기서(서버) 정한다.
      if (opts.kind === 'recharge' && productId) {
        const [bought] = await tx.select({ id: bankTransferOrders.id }).from(bankTransferOrders).where(and(
          eq(bankTransferOrders.userId, opts.userId), eq(bankTransferOrders.productId, productId), eq(bankTransferOrders.status, 'approved'))).limit(1)
        if (!bought) amountMinor = firstPurchasePrice(amountMinor)
      }
      const [created] = await tx.insert(bankTransferOrders).values({
        ...(opts.requestId ? { id: opts.requestId } : {}),
        userId: opts.userId, kind: opts.kind, productId, amountMinor, currency, units,
        depositorName, referenceCode: code, expiresAt,
      }).returning()
      return { row: created!, created: true }
    })
    if (result.created) {
      observe('bank_order.created', { userId: opts.userId, kind: opts.kind, productId, amountMinor })
      // 11/10 새 입금 대기 주문은 바로 운영자 채널로(15분 크론을 기다리지 않게). 실패해도 주문은 그대로.
      void afterResponse(() => postOperatorNote(`**새 계좌이체 주문** ${amountMinor.toLocaleString('ko-KR')}${currency === 'KRW' ? '원' : ` ${currency}`} · 입금자 ${depositorName} · 코드 ${code}`)).catch(() => {})
      // 11/12 신청 순간 텔레그램에도(승인 버튼은 사용자가 '입금 확인 요청'을 누르면 따로 온다). 설정이 없거나 실패해도 주문은 그대로.
      void afterResponse(async () => {
        const chatId = telegramPaymentConfig()?.chatId
        if (chatId) await telegramCall('sendMessage', { chat_id: chatId, text: `[MIRO 계좌이체 신청]\n${amountMinor.toLocaleString('ko-KR')}원${units ? ` · ${units.toLocaleString('ko-KR')} 토큰` : ' · 이용권'}\n입금자명: ${depositorName}\n대조 코드: ${code}\n\n아직 입금 전일 수 있어요. 사용자가 입금 확인을 요청하면 승인 버튼이 옵니다.` })
      }).catch(() => {})
    }
    return result.row
  } catch (e) {
    // 부분 UNIQUE 인덱스: 사용자당 대기 주문은 하나. 이미 있으면 그걸 쓰라고 알린다.
    if (String((e as { code?: string }).code) === '23505') throw new OrderPendingError('ORDER_ALREADY_PENDING')
    throw e
  }
}

/**
 * 대기 주문 취소(11/3) — 금액을 다시 고르려는 사용자용. 입금 확인을 이미 요청한 주문은 돈이 오갔을 수 있어 막는다.
 * 상태 칸에 '취소'가 없어 만료(expired)로 닫고 note 에 남긴다 — 새 주문을 바로 넣을 수 있다.
 */
export async function cancelBankOrder(userId: string, orderId: string): Promise<'cancelled' | 'requested' | 'not_pending'> {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'bank-order:' + userId}))`)
    const [order] = await tx.select({ id: bankTransferOrders.id, status: bankTransferOrders.status }).from(bankTransferOrders)
      .where(and(eq(bankTransferOrders.id, orderId), eq(bankTransferOrders.userId, userId))).limit(1).for('update')
    if (!order || order.status !== 'awaiting') return 'not_pending'
    const [asked] = await tx.select({ id: bankTelegramRequests.id }).from(bankTelegramRequests).where(eq(bankTelegramRequests.orderId, orderId)).limit(1)
    if (asked) return 'requested'
    await tx.update(bankTransferOrders).set({ status: 'expired', note: 'user_cancelled' }).where(eq(bankTransferOrders.id, orderId))
    observe('bank_order.user_cancelled', { userId, orderId })
    return 'cancelled'
  })
}

/** 이 사용자의 대기 주문. 없으면 null. */
export async function pendingBankOrder(userId: string) {
  const [row] = await db.select().from(bankTransferOrders)
    .where(and(eq(bankTransferOrders.userId, userId), eq(bankTransferOrders.status, 'awaiting')))
    .orderBy(desc(bankTransferOrders.createdAt)).limit(1)
  return row ?? null
}

export async function bankOrderHistory(userId: string, limit = 10) {
  return db.select().from(bankTransferOrders)
    .where(eq(bankTransferOrders.userId, userId))
    .orderBy(desc(bankTransferOrders.createdAt)).limit(limit)
}

/** 기한이 지난 대기 주문을 만료시킨다. Cron 과 주문 생성이 호출한다. */
export async function expireBankOrders(now = new Date(), userId?: string): Promise<number> {
  const where = userId
    ? and(eq(bankTransferOrders.status, 'awaiting'), lt(bankTransferOrders.expiresAt, now), eq(bankTransferOrders.userId, userId))
    : and(eq(bankTransferOrders.status, 'awaiting'), lt(bankTransferOrders.expiresAt, now))
  const rows = await db.update(bankTransferOrders).set({ status: 'expired' }).where(where).returning({ id: bankTransferOrders.id })
  return rows.length
}

/**
 * 승인된 주문을 지급한다. 승인(운영 앱)과 지급(여기)을 나눈 이유:
 *
 * 지급 경로는 `applyPaymentEvent` 하나뿐이어야 이중 지급을 막는 UNIQUE 가 단일 지점으로
 * 남는다. 그런데 그 경로는 web 앱 안에 있고 admin 앱은 이를 import 하지 않는다(두 Next 앱을
 * 묶지 않기 위해서다). 그래서 운영자는 주문 상태만 `approved` 로 바꾸고, 지급은 이미 15분마다
 * 도는 cron 이 여기서 수행한다. 지급이 늦어질 수는 있어도 두 번 일어나지는 않는다.
 *
 * 승인된 주문은 `settledAt` 이 채워질 때까지 매번 다시 시도된다 — 지급 실패가 조용히
 * 사라지지 않는다.
 */
export async function settleApprovedOrders(now = new Date(), limit = 50): Promise<{ settled: number; failed: number }> {
  const due = await db.select().from(bankTransferOrders)
    .where(and(eq(bankTransferOrders.status, 'approved'), isNull(bankTransferOrders.settledAt)))
    .orderBy(bankTransferOrders.decidedAt).limit(limit)

  let settled = 0, failed = 0
  for (const order of due) {
    try {
      const result = await applyPaymentEvent(BANK_PROVIDER, {
        // 주문 하나가 이벤트 하나다. 다시 들어와도 UNIQUE 가 한 번만 적용한다.
        externalEventId: `bank:${order.id}`,
        externalRef: order.kind === 'recharge' ? `bank_rc:${order.id}` : `bank_pass:${order.userId}`,
        type: 'purchase', userId: order.userId, periodEnd: null,
        productId: order.productId,
        // 주문 시점에 서버가 확정한 지급량. 카탈로그가 그 뒤 바뀌어도 이 값으로 지급한다.
        serverUnits: order.units,
        raw: { source: 'bank_transfer', orderId: order.id, amountMinor: order.amountMinor, currency: order.currency,
          depositorName: order.depositorName, referenceCode: order.referenceCode, decidedBy: order.decidedBy },
      })
      if (result === 'unknown_user') { failed++; observe('bank_order.settle_failed', { orderId: order.id, reason: result }); continue }
      await db.update(bankTransferOrders).set({ settledAt: now }).where(eq(bankTransferOrders.id, order.id))
      settled++
      observe('bank_order.settled', { orderId: order.id, userId: order.userId, kind: order.kind, result })
    } catch (e) {
      // settledAt 을 남기지 않으므로 다음 cron 이 다시 시도한다.
      failed++
      observe('bank_order.settle_failed', { orderId: order.id, error: (e as Error).message })
    }
  }
  return { settled, failed }
}
