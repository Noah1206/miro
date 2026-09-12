import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { StripePaymentProvider } from '../payment/stripe'

const SECRET = 'whsec_test'
const p = new StripePaymentProvider('sk_test', SECRET, 'price_1', 'https://x/ok', 'https://x/no')

const sign = (body: string, at = Math.floor(Date.now() / 1000), secret = SECRET) =>
  `t=${at},v1=${createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')}`

const event = (type: string, object: Record<string, unknown>) =>
  JSON.stringify({ id: 'evt_1', type, data: { object } })

describe('stripe webhook signature', () => {
  it('accepts a correctly signed event', async () => {
    const body = event('checkout.session.completed', { id: 'cs_1', subscription: 'sub_1', metadata: { userId: 'u1' } })
    const ev = await p.parseWebhook(body, sign(body))
    expect(ev).not.toBeNull()
    expect(ev!.type).toBe('purchase')
    expect(ev!.userId).toBe('u1')
    expect(ev!.externalRef).toBe('sub_1')
  })

  it('rejects a wrong secret', async () => {
    const body = event('checkout.session.completed', { id: 'cs_1', metadata: { userId: 'u1' } })
    expect(await p.parseWebhook(body, sign(body, undefined, 'whsec_other'))).toBeNull()
  })

  it('rejects a tampered body under a valid old signature', async () => {
    const body = event('checkout.session.completed', { id: 'cs_1', metadata: { userId: 'u1' } })
    const sig = sign(body)
    const tampered = event('checkout.session.completed', { id: 'cs_1', metadata: { userId: 'attacker' } })
    expect(await p.parseWebhook(tampered, sig)).toBeNull()
  })

  it('rejects a replayed old signature', async () => {
    const body = event('checkout.session.completed', { id: 'cs_1', metadata: { userId: 'u1' } })
    const old = Math.floor(Date.now() / 1000) - 600
    expect(await p.parseWebhook(body, sign(body, old))).toBeNull()
  })

  it('rejects a missing signature', async () => {
    expect(await p.parseWebhook(event('checkout.session.completed', {}), null)).toBeNull()
  })

  it('ignores event types the app does not model', async () => {
    const body = event('customer.created', { id: 'cus_1' })
    expect(await p.parseWebhook(body, sign(body))).toBeNull()
  })

  it('maps renewal, failure, cancel and refund', async () => {
    const cases: Array<[string, string]> = [
      ['invoice.payment_succeeded', 'renewal'],
      ['invoice.payment_failed', 'failed'],
      ['customer.subscription.deleted', 'cancel'],
      ['charge.refunded', 'refund'],
    ]
    for (const [stripeType, expected] of cases) {
      const body = event(stripeType, { id: 'x', subscription: 'sub_1', metadata: { userId: 'u1' } })
      const ev = await p.parseWebhook(body, sign(body))
      expect(ev?.type, stripeType).toBe(expected)
    }
  })

  it('falls back to client_reference_id when metadata is absent', async () => {
    const body = event('checkout.session.completed', { id: 'cs_1', client_reference_id: 'u9' })
    expect((await p.parseWebhook(body, sign(body)))!.userId).toBe('u9')
  })
})
