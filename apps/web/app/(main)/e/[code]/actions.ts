'use server'
import { requireUser } from '@/lib/auth'
import { redeemCoupon } from '@/lib/coupon'
import { applyReferral, myReferral } from '@/lib/referral'

/**
 * 11/18 이벤트 페이지의 '받기' — 쿠폰을 받고, 친구의 추천 링크(?ref=)로 들어왔으면 추천도 함께 적용한다.
 * 쿠폰이 이미 받았거나 마감이어도 추천은 따로 시도한다(친구에게 추천 보상이 가도록).
 */
export async function claimEvent(code: string, ref: string | null) {
  const user = await requireUser()
  const coupon = await redeemCoupon(user.id, code)
  const referral = ref ? await applyReferral(user.id, ref.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)) : null
  const mine = await myReferral(user.id)
  return { coupon, referral, myCode: mine.code }
}
