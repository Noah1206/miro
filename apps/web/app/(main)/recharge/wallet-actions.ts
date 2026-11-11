'use server'
import { requireUser } from '@/lib/auth'
import { cancelBankOrder, createBankOrder, OrderPendingError } from '@/lib/payments/bank-transfer'
import { walletHistory, walletSnapshot } from '@/lib/wallet/service'
import { observe } from '@/lib/observe'
import { msg } from '@/lib/i18n'
import { isMinor } from '@/lib/payments/minor'
import { requestBankDeposit } from '@/lib/payments/telegram'
import { walletRealtimeChannel } from '@/lib/wallet/realtime'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

/** The caller cannot choose a different user's topic. Cookie auth is mandatory. */
export async function openWalletChannel() {
  const user = await requireUser()
  return walletRealtimeChannel(user.id)
}

export async function readWallet(orderId?: string) {
  const user = await requireUser()
  if (orderId && !UUID.test(orderId)) throw new Error('INVALID_ORDER')
  return walletSnapshot(user.id, orderId)
}

export async function readWalletHistory(cursor?: string) {
  const user = await requireUser()
  return walletHistory(user.id, cursor)
}

export async function requestDepositConfirmation(orderId:string, requestId:string) {
  const user=await requireUser()
  try {
    const result=await requestBankDeposit(user.id,orderId,requestId)
    return {ok:true as const,sent:result.sent,wallet:await walletSnapshot(user.id,orderId)}
  } catch { return {ok:false as const,error:msg('입금 확인 요청을 보내지 못했어요. 다시 시도해 주세요.')} }
}

/** 대기 주문을 취소하고 금액을 다시 고른다(11/3). 입금 확인을 요청한 주문은 바꿀 수 없다. */
export async function cancelPendingOrder(orderId: string) {
  const user = await requireUser()
  if (!UUID.test(orderId)) return { ok: false as const, error: msg('주문 정보를 확인해 주세요.') }
  const result = await cancelBankOrder(user.id, orderId)
  if (result === 'requested') return { ok: false as const, error: msg('입금 확인을 요청한 주문은 바꿀 수 없어요. 운영자 확인을 기다려 주세요.') }
  return { ok: true as const, wallet: await walletSnapshot(user.id) }
}

/** Browser supplies identity only. Catalog prices and settlement remain server-owned. */
export async function purchaseCredits(selection: string, requestId: string, guardianConsent = false) {
  const user = await requireUser()
  if (!UUID.test(requestId) || typeof selection !== 'string' || !selection.startsWith('recharge:')) return { ok: false as const, error: msg('주문 정보를 확인해 주세요.') }
  // 11/12 미성년(만 19세 미만)은 법정대리인 동의를 확인한 뒤에만 주문한다(민법 제5조).
  if (!guardianConsent && await isMinor(user.id)) return { ok: false as const, error: msg('법정대리인(부모님) 동의를 확인해 주세요.') }
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
