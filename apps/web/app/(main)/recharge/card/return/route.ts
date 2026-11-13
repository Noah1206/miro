import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { settleCardPayment } from '@/lib/payments/portone-card'

/**
 * 모바일 결제창이 돌아오는 주소(11/13) — 포트원이 ?paymentId=…&code=… 를 붙인다. code 가 있으면 사용자가 닫았거나 PG 오류.
 * 결제 결과는 포트원에서 다시 조회해 반영한 뒤 충전 화면으로 보낸다(웹훅이 먼저 반영했어도 결과는 같다).
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const back = (card: string) => NextResponse.redirect(new URL(`/recharge?card=${card}`, url.origin))
  const user = await currentUser()
  const paymentId = url.searchParams.get('paymentId')
  if (!user || !paymentId) return back('failed')
  if (url.searchParams.get('code')) return back('closed')
  const status = await settleCardPayment(paymentId, user.id)
  return back(status === 'paid' ? 'paid' : status === 'pending' ? 'pending' : 'failed')
}
