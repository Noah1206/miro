import { createHmac, timingSafeEqual } from 'node:crypto'
import { POLICY } from '@miro/config'
import type { ProviderInfo } from '../types'
import type { Checkout, PaymentEvent, PaymentProvider } from './types'

const API = 'https://api.stripe.com/v1'

/**
 * Stripe 구독 Adapter. SDK 없이 REST + 직접 서명 검증.
 *
 * 앱은 Stripe 의 이벤트 종류를 모른다 — 여기서 PaymentEvent 로 정규화한다.
 * userId 는 checkout 생성 시 metadata 와 client_reference_id 양쪽에 심어,
 * 어떤 이벤트로 돌아오든 사용자를 되찾을 수 있게 한다.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe'
  readonly info: ProviderInfo

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly priceId: string,
    private readonly successUrl: string,
    private readonly cancelUrl: string,
  ) {
    this.info = { mode: 'live', name: 'stripe', notice: null }
  }

  async createCheckout(req: { userId: string; plan: 'pro' }): Promise<Checkout> {
    const body = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': this.priceId,
      'line_items[0][quantity]': '1',
      client_reference_id: req.userId,
      'metadata[userId]': req.userId,
      'subscription_data[metadata][userId]': req.userId,
      success_url: this.successUrl,
      cancel_url: this.cancelUrl,
    })
    const s = await this.post('/checkout/sessions', body)
    return { checkoutId: String(s.id), redirectUrl: typeof s.url === 'string' ? s.url : null }
  }

  /** 서명이 맞지 않으면 null — 검증 없이 이벤트를 만들지 않는다. */
  async parseWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent | null> {
    if (!signature || !verify(rawBody, signature, this.webhookSecret)) return null

    let ev: { id?: string; type?: string; data?: { object?: Record<string, unknown> } }
    try { ev = JSON.parse(rawBody) } catch { return null }
    const obj = ev.data?.object ?? {}
    const type = mapType(ev.type ?? '')
    if (!type) return null   // 우리가 이해하지 않는 이벤트는 조용히 무시 (200 으로 끝난다)

    const userId = userIdOf(obj)
    const externalRef = String(
      obj.subscription ?? obj.id ?? '',
    )
    const periodEnd = typeof obj.current_period_end === 'number'
      ? new Date(obj.current_period_end * 1000)
      : type === 'purchase' || type === 'renewal'
        ? new Date(Date.now() + POLICY.subscription.periodDays * 86_400_000)
        : null

    return { externalEventId: String(ev.id ?? ''), externalRef, type, userId, periodEnd, raw: obj }
  }

  /** 재설치·기기 변경 시 이 사용자의 살아 있는 구독을 Stripe 에서 되찾는다. */
  async restore(req: { userId: string }): Promise<{ externalRef: string; periodEnd: Date } | null> {
    const q = encodeURIComponent(`status:'active' AND metadata['userId']:'${req.userId}'`)
    const r = await this.get(`/subscriptions/search?query=${q}&limit=1`)
    const sub = (r.data as Array<Record<string, unknown>> | undefined)?.[0]
    if (!sub) return null
    const end = typeof sub.current_period_end === 'number' ? new Date(sub.current_period_end * 1000) : null
    return end ? { externalRef: String(sub.id), periodEnd: end } : null
  }

  /** 기간 끝까지는 유지하고 자동 갱신만 끈다 — 명세서의 해지 정책과 같다. */
  async cancel(externalRef: string): Promise<void> {
    await this.post(`/subscriptions/${externalRef}`, new URLSearchParams({ cancel_at_period_end: 'true' }))
  }

  private async post(path: string, body: URLSearchParams): Promise<Record<string, unknown>> {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) throw new Error(`stripe ${path} failed: ${res.status} ${await res.text().catch(() => '')}`)
    return (await res.json()) as Record<string, unknown>
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${this.secretKey}` } })
    if (!res.ok) throw new Error(`stripe ${path} failed: ${res.status}`)
    return (await res.json()) as Record<string, unknown>
  }
}

function mapType(t: string): PaymentEvent['type'] | null {
  if (t === 'checkout.session.completed') return 'purchase'
  if (t === 'invoice.payment_succeeded') return 'renewal'
  if (t === 'invoice.payment_failed') return 'failed'
  if (t === 'customer.subscription.deleted') return 'cancel'
  if (t === 'charge.refunded') return 'refund'
  return null
}

function userIdOf(obj: Record<string, unknown>): string | null {
  const meta = obj.metadata as Record<string, unknown> | undefined
  const fromMeta = meta?.userId
  if (typeof fromMeta === 'string') return fromMeta
  const ref = obj.client_reference_id
  return typeof ref === 'string' ? ref : null
}

/**
 * Stripe-Signature: `t=<unix>,v1=<hex>`. HMAC-SHA256 over "t.payload".
 * 타이밍 안전 비교 + 재생 공격 방지를 위한 시간 창(5분).
 */
function verify(payload: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=', 2) as [string, string]))
  const t = parts.t, v1 = parts.v1
  if (!t || !v1) return false
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(v1)
  return a.length === b.length && timingSafeEqual(a, b)
}
