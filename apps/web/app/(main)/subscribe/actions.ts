'use server'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { resolvePayment } from '@miro/providers'
import { applyPaymentEvent, restorePurchase, startCheckout } from '@/lib/payments/service'

/** n56 — 결제 시작. 실 PG 는 redirectUrl 로 보낸다. Mock 은 앱 안 시뮬레이션 화면으로. */
export async function beginCheckout() {
  const user = await requireUser()
  const c = await startCheckout(user.id)
  if (c.redirectUrl) redirect(c.redirectUrl)
  redirect(`/subscribe?checkout=${encodeURIComponent(c.checkoutId)}`)
}

/**
 * Mock 결제 결과 시뮬레이션 (n57). 실 PG 에서는 webhook 이 이 경로를 대신한다.
 * 같은 applyPaymentEvent 를 타므로 자격 적용 로직은 하나다.
 */
export async function simulateOutcome(checkoutId: string, outcome: 'success' | 'failed') {
  const user = await requireUser()
  const provider = resolvePayment()
  if (provider.info.mode !== 'mock') redirect('/subscribe/result?status=failed')
  const ev = await provider.parseWebhook(JSON.stringify({ checkoutId, outcome, eventId: `${checkoutId}:${outcome}` }), `mock:${user.id}`)
  if (!ev) redirect('/subscribe/result?status=failed')
  const r = await applyPaymentEvent(provider.name, ev)
  redirect(`/subscribe/result?status=${outcome === 'success' && r !== 'unknown_user' ? 'success' : 'failed'}`)
}

/** n59 — 구독 복원. */
export async function restore() {
  const user = await requireUser()
  const r = await restorePurchase(user.id)
  redirect(`/subscribe/result?status=${r === 'restored' ? 'restored' : 'nothing'}`)
}
