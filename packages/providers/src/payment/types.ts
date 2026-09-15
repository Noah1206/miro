import type { ProviderInfo } from '../types'

export type Checkout = {
  checkoutId: string
  /** 실제 PG 는 결제 페이지로 보낸다. Mock 은 null — 앱 안에서 시뮬레이션한다. */
  redirectUrl: string | null
}

/** Provider 가 webhook 으로 알려주는 정규화된 이벤트. 앱은 이것만 이해한다. */
export type PaymentEvent = {
  externalEventId: string
  externalRef: string
  type: 'purchase' | 'renewal' | 'cancel' | 'refund' | 'failed'
  userId: string | null
  periodEnd: Date | null
  /**
   * 일회성 충전 구매면 상품 id. 구독이면 없다.
   * 지급량은 이 id 로 서버 카탈로그에서 찾는다 — 이벤트가 실어 온 수량을 믿지 않는다.
   */
  productId?: string | null
  raw: Record<string, unknown>
}

export interface PaymentProvider {
  readonly name: string
  readonly info: ProviderInfo
  createCheckout(req: { userId: string; plan: 'pro' }): Promise<Checkout>
  /**
   * 일회성 충전 결제. 금액과 지급량은 서버 카탈로그에서 온 값만 받는다.
   * Provider 를 구현하지 않았으면 undefined — 호출부가 '판매 준비 중' 으로 처리한다.
   */
  createRechargeCheckout?(req: { userId: string; productId: string; priceMinor: number; currency: string }): Promise<Checkout>
  /** 서명 검증 실패 → null. 검증 없이 이벤트를 만들지 않는다. */
  parseWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent | null>
  /** 스토어/PG 의 구매 이력에서 이 사용자의 유효 구독을 찾는다 (재설치·기기 변경). */
  restore(req: { userId: string }): Promise<{ externalRef: string; periodEnd: Date } | null>
  cancel(externalRef: string): Promise<void>
}
