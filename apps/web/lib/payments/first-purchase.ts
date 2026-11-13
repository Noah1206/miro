import { and, eq } from 'drizzle-orm'
import { bankTransferOrders, cardPaymentOrders, db } from '@miro/db'

type Reader = Pick<typeof db, 'selectDistinct'>

/**
 * 첫 구매 할인(11/12)을 이미 쓴 상품 — 승인된 계좌이체 주문과 결제 완료된 카드 주문(11/13)을 함께 본다.
 * 지갑 화면의 할인 표시와 두 주문 경로의 실제 금액이 같은 기준을 쓴다.
 */
export async function purchasedProductIds(userId: string, reader: Reader = db): Promise<Set<string>> {
  const [bank, card] = await Promise.all([
    reader.selectDistinct({ productId: bankTransferOrders.productId }).from(bankTransferOrders)
      .where(and(eq(bankTransferOrders.userId, userId), eq(bankTransferOrders.status, 'approved'))),
    reader.selectDistinct({ productId: cardPaymentOrders.productId }).from(cardPaymentOrders)
      .where(and(eq(cardPaymentOrders.userId, userId), eq(cardPaymentOrders.status, 'paid'))),
  ])
  return new Set([...bank, ...card].map(r => r.productId).filter((p): p is string => !!p))
}
