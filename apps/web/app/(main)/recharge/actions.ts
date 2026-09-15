'use server'
import { mockProvidersAllowed, productionRuntime } from '@miro/config'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { resolvePayment } from '@miro/providers'
import { applyPaymentEvent, startRechargeCheckout } from '@/lib/payments/service'
import { BankTransferUnavailableError, OrderPendingError, createBankOrder } from '@/lib/payments/bank-transfer'

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

/**
 * 계좌이체 주문 접수. **지급하지 않는다** — 운영자가 입금을 확인해 승인해야 반영된다.
 * 금액과 지급량은 서버 카탈로그에서만 온다.
 */
export async function orderByTransfer(formData: FormData) {
  const user = await requireUser()
  const kind = formData.get('kind') === 'recharge' ? 'recharge' as const : 'pass' as const
  const productId = String(formData.get('productId') ?? '') || undefined
  const depositorName = String(formData.get('depositorName') ?? '')
  // redirect 는 예외를 던져 흐름을 옮긴다 — try 안에서 부르면 catch 가 삼킨다. 밖에서 부른다.
  let code = 'created'
  try {
    await createBankOrder({ userId: user.id, kind, productId, depositorName })
  } catch (e) {
    code = e instanceof OrderPendingError ? 'pending'
      : e instanceof BankTransferUnavailableError ? 'unavailable'
      : (e as Error).message === 'INVALID_DEPOSITOR_NAME' ? 'name' : 'failed'
  }
  redirect(`/recharge?order=${code}`)
}
