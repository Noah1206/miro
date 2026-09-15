import { randomUUID } from 'node:crypto'
import { POLICY } from '@miro/config'
import type { ProviderInfo } from '../types'
import type { Checkout, PaymentEvent, PaymentProvider } from './types'

/**
 * PG 미확정 상태의 결제 시뮬레이션. 실제 과금이 일어나지 않음을 UI 에 명시한다.
 * 실제 Adapter(Stripe/Toss/PortOne…) 는 같은 인터페이스를 구현하고 registry 에서 env 로 선택된다.
 *
 * Mock webhook 서명: `mock:<userId>` — 실 서명 검증의 자리를 지키기 위한 형식이다.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock'
  readonly info: ProviderInfo = { mode: 'mock', name: 'mock-payment', notice: '결제 Provider 미구성 — 실제 결제가 일어나지 않는 시뮬레이션입니다.' }
  /** restore 시뮬레이션용 "스토어 구매 이력". 프로세스 메모리 — 실 Provider 는 원격 조회. */
  private readonly purchases = new Map<string, { externalRef: string; periodEnd: Date }>()

  async createCheckout(req: { userId: string; plan: 'pro' }): Promise<Checkout> {
    return { checkoutId: `mockco_${req.userId}_${randomUUID()}`, redirectUrl: null }
  }

  /** 충전 결제 시뮬레이션. checkoutId 에 상품 id 를 실어 webhook 이 되짚을 수 있게 한다. */
  async createRechargeCheckout(req: { userId: string; productId: string; priceMinor: number; currency: string }): Promise<Checkout> {
    return { checkoutId: `mockrc_${req.userId}_${req.productId}_${randomUUID()}`, redirectUrl: null }
  }

  async parseWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent | null> {
    let body: { checkoutId?: string; outcome?: 'success' | 'failed' | 'cancel' | 'refund'; externalRef?: string; eventId?: string }
    try { body = JSON.parse(rawBody) } catch { return null }
    const userId = signature?.startsWith('mock:') ? signature.slice(5) : null
    if (!userId || !body.checkoutId?.includes(userId)) return null   // 서명과 본문이 맞아야 한다
    const type = body.outcome === 'success' ? 'purchase' : body.outcome === 'cancel' ? 'cancel' : body.outcome === 'refund' ? 'refund' : 'failed'

    // 충전 결제는 checkoutId 가 상품을 지목한다: mockrc_<userId>_<productId>_<uuid>
    const recharge = body.checkoutId.startsWith('mockrc_')
      ? body.checkoutId.slice(`mockrc_${userId}_`.length).split('_').slice(0, -1).join('_')
      : null
    if (recharge) {
      const externalRef = body.externalRef ?? body.checkoutId
      return { externalEventId: body.eventId ?? body.checkoutId, externalRef, type, userId, periodEnd: null, productId: recharge, raw: body as Record<string, unknown> }
    }

    const externalRef = body.externalRef ?? `mocksub_${userId}`
    const periodEnd = new Date(Date.now() + POLICY.subscription.periodDays * 86_400_000)
    if (type === 'purchase') this.purchases.set(userId, { externalRef, periodEnd })
    return { externalEventId: body.eventId ?? body.checkoutId, externalRef, type, userId, periodEnd: type === 'purchase' ? periodEnd : null, productId: null, raw: body as Record<string, unknown> }
  }

  async restore(req: { userId: string }) { return this.purchases.get(req.userId) ?? null }
  async cancel(): Promise<void> {}
}
