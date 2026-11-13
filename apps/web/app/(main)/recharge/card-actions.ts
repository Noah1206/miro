'use server'
import { requireUser } from '@/lib/auth'
import { msg } from '@/lib/i18n'
import { observe } from '@/lib/observe'
import { isMinor } from '@/lib/payments/minor'
import { CardPaymentUnavailableError, createCardOrder, settleCardPayment } from '@/lib/payments/portone-card'
import { walletSnapshot } from '@/lib/wallet/service'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

/** 카드 결제 시작(11/13) — 브라우저는 상품 id 만 보낸다. 금액·주문명은 서버가 정해 결제창에 넘길 값으로 돌려준다. */
export async function startCardPayment(selection: string, requestId: string, guardianConsent = false) {
  const user = await requireUser()
  if (!UUID.test(requestId) || typeof selection !== 'string' || !selection.startsWith('recharge:')) return { ok: false as const, error: msg('주문 정보를 확인해 주세요.') }
  // 계좌이체와 같은 규칙 — 만 19세 미만은 법정대리인 동의 확인 후에만(민법 제5조). 동의 기록은 취소 요청 때 대조한다.
  if (await isMinor(user.id)) {
    if (guardianConsent !== true) return { ok: false as const, error: msg('법정대리인(부모님) 동의를 확인해 주세요.') }
    observe('wallet.guardian_consent', { userId: user.id, requestId, selection, method: 'card', at: new Date().toISOString() })
  }
  try {
    const payment = await createCardOrder({ userId: user.id, productId: selection.slice('recharge:'.length), requestId })
    return { ok: true as const, payment, customerId: user.id }
  } catch (e) {
    observe('card_order.failed', { userId: user.id, error: (e as Error).message })
    return { ok: false as const, error: e instanceof CardPaymentUnavailableError ? msg('지금은 카드 결제를 받지 않고 있어요.') : msg('주문을 만들지 못했어요. 다시 시도해 주세요.') }
  }
}

/** 결제창이 닫힌 뒤 확인 — 서버가 포트원에서 결제를 다시 조회해 지급한다. 같은 결제는 몇 번 눌러도 한 번만 지급. */
export async function confirmCardPayment(paymentId: string) {
  const user = await requireUser()
  const status = await settleCardPayment(paymentId, user.id)
  return { status, wallet: await walletSnapshot(user.id) }
}
