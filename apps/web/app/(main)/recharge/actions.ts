'use server'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { BankTransferUnavailableError, OrderPendingError, createBankOrder } from '@/lib/payments/bank-transfer'

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
