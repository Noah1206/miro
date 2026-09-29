'use server'
import { requireUser } from '@/lib/auth'
import { createBankOrder, OrderPendingError } from '@/lib/payments/bank-transfer'
import { walletHistory, walletSnapshot } from '@/lib/wallet/service'
import { observe } from '@/lib/observe'
import { msg } from '@/lib/i18n'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export async function readWallet(orderId?: string) {
  const user = await requireUser()
  if (orderId && !UUID.test(orderId)) throw new Error('INVALID_ORDER')
  return walletSnapshot(user.id, orderId)
}

export async function readWalletHistory(cursor?: string) {
  const user = await requireUser()
  return walletHistory(user.id, cursor)
}

/** Browser supplies identity only. Catalog prices and settlement remain server-owned. */
export async function purchaseCredits(selection: string, requestId: string) {
  const user = await requireUser()
  if (!UUID.test(requestId) || typeof selection !== 'string' || !selection.startsWith('recharge:')) return { ok: false as const, error: msg('주문 정보를 확인해 주세요.') }
  try {
    const order = await createBankOrder({ userId: user.id, kind: 'recharge',
      productId: selection.slice('recharge:'.length), requestId })
    return { ok: true as const, wallet: await walletSnapshot(user.id, order.id) }
  } catch (e) {
    if (e instanceof OrderPendingError) return { ok: true as const, wallet: await walletSnapshot(user.id) }
    observe('wallet.order_failed', { userId: user.id, error: (e as Error).message })
    return { ok: false as const, error: msg('주문을 확인하지 못했어요. 다시 확인해도 같은 주문으로 처리해요.') }
  }
}
