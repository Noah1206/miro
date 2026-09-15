'use server'
import { mockProvidersAllowed, productionRuntime } from '@miro/config'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { resolvePayment } from '@miro/providers'
import { applyPaymentEvent, startRechargeCheckout } from '@/lib/payments/service'

/** 충전 결제 시작. 상품 id 만 받고 가격은 서버 카탈로그에서 읽는다. */
export async function beginRecharge(formData: FormData) {
  if (productionRuntime()) redirect('/recharge')
  const user = await requireUser()
  const productId = String(formData.get('productId') ?? '')
  const c = await startRechargeCheckout(user.id, productId)
  if (c.redirectUrl) redirect(c.redirectUrl)
  redirect(`/recharge?checkout=${encodeURIComponent(c.checkoutId)}`)
}

/**
 * Mock 결제 결과 시뮬레이션. 실 PG 에서는 webhook 이 이 경로를 대신한다 —
 * 어느 쪽이든 같은 applyPaymentEvent 를 타므로 지급 로직은 하나다.
 */
export async function simulateRecharge(checkoutId: string, outcome: 'success' | 'failed') {
  if (!mockProvidersAllowed()) redirect('/recharge')
  const user = await requireUser()
  const provider = resolvePayment()
  if (provider.info.mode !== 'mock') redirect('/recharge?result=failed')
  const ev = await provider.parseWebhook(JSON.stringify({ checkoutId, outcome, eventId: `${checkoutId}:${outcome}` }), `mock:${user.id}`)
  if (!ev) redirect('/recharge?result=failed')
  await applyPaymentEvent(provider.name, ev)
  redirect(`/recharge?result=${outcome === 'success' ? 'success' : 'failed'}`)
}
