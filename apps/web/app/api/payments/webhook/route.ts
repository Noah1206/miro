import { mockProvidersAllowed } from '@miro/config'
import { NextResponse } from 'next/server'
import { resolvePayment } from '@miro/providers'
import { applyPaymentEvent } from '@/lib/payments/service'

/**
 * PG webhook. 서명 검증 실패는 400. 중복은 200(이미 적용됨) — PG 가 재전송을 멈추게.
 * Mock Provider 의 서명(`mock:<userId>`)은 dev API 가 켜진 환경에서만 받는다.
 */
export async function POST(req: Request) {
  const provider = resolvePayment()
  // PG 마다 서명 헤더 이름이 다르다. Adapter 가 형식을 검증하므로 여기서는 넘겨주기만 한다.
  const signature = req.headers.get('stripe-signature') ?? req.headers.get('x-payment-signature')
  if (provider.info.mode === 'mock' && !mockProvidersAllowed()) {
    return NextResponse.json({ error: 'payment provider not configured' }, { status: 503 })
  }
  const ev = await provider.parseWebhook(await req.text(), signature)
  if (!ev) return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  const r = await applyPaymentEvent(provider.name, ev)
  return NextResponse.json({ result: r }, { status: r === 'unknown_user' ? 202 : 200 })
}
