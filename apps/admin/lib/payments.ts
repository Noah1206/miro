import { and, desc, eq } from 'drizzle-orm'
import { db, adminActions, bankTransferOrders, users } from '@miro/db'

export type OrderStatus = 'awaiting' | 'approved' | 'rejected' | 'expired'

/**
 * 입금 확인 대기 목록. 오래된 것부터 — 먼저 입금한 사람이 먼저 처리된다.
 *
 * 운영자는 이 목록의 금액·입금자명·대조 코드를 은행 거래내역과 눈으로 맞춘다.
 * 자동 대사는 하지 않는다: 은행 연동이 없는 단계에서 자동 승인은 오지급으로 직결된다.
 */
export async function listBankOrders(status: OrderStatus | 'all' = 'awaiting') {
  const rows = await db.select({
    id: bankTransferOrders.id, kind: bankTransferOrders.kind, productId: bankTransferOrders.productId,
    amountMinor: bankTransferOrders.amountMinor, currency: bankTransferOrders.currency, units: bankTransferOrders.units,
    depositorName: bankTransferOrders.depositorName, referenceCode: bankTransferOrders.referenceCode,
    status: bankTransferOrders.status, note: bankTransferOrders.note,
    createdAt: bankTransferOrders.createdAt, expiresAt: bankTransferOrders.expiresAt,
    decidedAt: bankTransferOrders.decidedAt,
    email: users.email,
  }).from(bankTransferOrders).innerJoin(users, eq(users.id, bankTransferOrders.userId))
    .where(status === 'all' ? undefined : eq(bankTransferOrders.status, status))
    .orderBy(status === 'awaiting' ? bankTransferOrders.createdAt : desc(bankTransferOrders.createdAt))
    .limit(200)
  return rows
}

export async function awaitingCount(): Promise<number> {
  const rows = await db.select({ id: bankTransferOrders.id }).from(bankTransferOrders)
    .where(and(eq(bankTransferOrders.status, 'awaiting')))
  return rows.length
}

/**
 * 입금 확인 승인. **여기서 지급하지 않는다** — 주문 상태만 바꾼다.
 *
 * 지급은 web 앱의 cron 이 `settleApprovedOrders` 로 수행한다. 지급 경로를 한 곳에 두어
 * 이중 지급을 막는 UNIQUE 를 단일 지점으로 유지하기 위해서다(운영 앱은 web 을 import 하지
 * 않는다). 조건부 UPDATE 라 두 운영자가 동시에 눌러도 승인은 한 번이다.
 */
export async function approveBankOrder(adminId: string, orderId: string, note = '', now = new Date()): Promise<'approved' | 'not_pending'> {
  const [order] = await db.update(bankTransferOrders)
    .set({ status: 'approved', decidedBy: adminId, decidedAt: now, note })
    .where(and(eq(bankTransferOrders.id, orderId), eq(bankTransferOrders.status, 'awaiting')))
    .returning()
  if (!order) return 'not_pending'
  await db.insert(adminActions).values({
    adminId, action: 'bank_order_approve', bankOrderId: order.id,
    previousStatus: 'awaiting', newStatus: 'approved', note,
  })
  return 'approved'
}

/** 입금이 확인되지 않은 주문 거절. 지급하지 않으며 근거를 남긴다. */
export async function rejectBankOrder(adminId: string, orderId: string, note: string, now = new Date()): Promise<'rejected' | 'not_pending'> {
  const reason = note.trim()
  if (!reason) throw new Error('NOTE_REQUIRED')
  const [order] = await db.update(bankTransferOrders)
    .set({ status: 'rejected', decidedBy: adminId, decidedAt: now, note: reason })
    .where(and(eq(bankTransferOrders.id, orderId), eq(bankTransferOrders.status, 'awaiting')))
    .returning()
  if (!order) return 'not_pending'
  await db.insert(adminActions).values({
    adminId, action: 'bank_order_reject', bankOrderId: order.id,
    previousStatus: 'awaiting', newStatus: 'rejected', note: reason,
  })
  return 'rejected'
}
