import { NextResponse } from 'next/server'
import { cardPaymentConfig, settleCardPayment, verifyPortOneWebhook } from '@/lib/payments/portone-card'
import { observe } from '@/lib/observe'

/**
 * 포트원 V2 결제 웹훅(11/13) — 포트원 콘솔 '결제 알림(웹훅)' 주소: https://miroapp.app/api/payments/portone
 * 서명이 맞으면 결제 건을 포트원에서 다시 조회해 반영한다(본문의 상태·금액은 믿지 않는다). 몇 번 와도 결과가 같다.
 * 결제 건과 관계없는 알림(빌링키 등)은 200 으로 넘긴다 — 포트원이 재전송을 멈추게.
 */
export async function POST(req: Request) {
  if (!cardPaymentConfig()) return NextResponse.json({ error: 'card payment not configured' }, { status: 503 })
  const body = await req.text()
  const ev = verifyPortOneWebhook(body, { id: req.headers.get('webhook-id'), timestamp: req.headers.get('webhook-timestamp'), signature: req.headers.get('webhook-signature') })
  if (!ev) return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  const type = typeof ev.type === 'string' ? ev.type : ''
  const paymentId = (ev.data as { paymentId?: unknown } | undefined)?.paymentId
  if (!type.startsWith('Transaction.') || typeof paymentId !== 'string') return NextResponse.json({ result: 'ignored' })
  const status = await settleCardPayment(paymentId)
  observe('card_payment.webhook', { type, paymentId, status })
  return NextResponse.json({ result: status })
}
