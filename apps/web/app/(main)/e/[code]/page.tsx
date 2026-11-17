import type { Metadata } from 'next'
import { and, eq } from 'drizzle-orm'
import { coupons, db, rechargeGrants } from '@miro/db'
import { REFERRAL_GRANT } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { myReferral } from '@/lib/referral'
import { EventClaim } from './claim'

/**
 * 11/18 이벤트 쿠폰 페이지 — miroapp.app/e/<쿠폰>?ref=<추천인 코드>. '받기' 한 번으로 쿠폰 지급(+추천 적용), 받은 뒤 내 추천 링크를 복사·공유.
 * 로그인 전이면 받기 버튼이 로그인 시트를 열고, 로그인·가입 뒤 이 주소로 돌아온다(ref 포함).
 */
const norm = (s: string) => decodeURIComponent(s).trim().toUpperCase().replace(/\s+/g, '').slice(0, 40)

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const code = norm((await params).code)
  const title = '미로 오픈 이벤트 — 무료 토큰 + 친구 추천'
  const description = '캐릭터 대사를 목소리로 듣는 음성 캐릭터챗 미로. 버튼 한 번으로 무료 토큰을 받고, 친구에게 공유하면 친구도 나도 토큰을 받아요.'
  return { title, description, openGraph: { title, description, url: `/e/${code}`, images: [{ url: '/events/open-event.jpg', width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/events/open-event.jpg'] } }
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ ref?: string }> }) {
  const code = norm((await params).code)
  const ref = (await searchParams).ref?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || null
  const user = await currentUser()
  const [coupon] = await db.select({ units: coupons.units, validDays: coupons.validDays, maxUses: coupons.maxUses, uses: coupons.uses, endsAt: coupons.endsAt })
    .from(coupons).where(eq(coupons.code, code)).limit(1)
  const open = !!coupon && (!coupon.endsAt || coupon.endsAt > new Date()) && (coupon.maxUses === null || coupon.uses < coupon.maxUses)
  const received = user ? (await db.select({ id: rechargeGrants.id }).from(rechargeGrants)
    .where(and(eq(rechargeGrants.provider, 'coupon'), eq(rechargeGrants.externalRef, `${user.id}:${code}`))).limit(1)).length > 0 : false
  const myCode = user ? (await myReferral(user.id)).code : null
  return <EventClaim code={code} refCode={ref} signedIn={!!user} received={received} myCode={myCode}
    coupon={coupon ? { units: coupon.units, validDays: coupon.validDays, open, left: coupon.maxUses === null ? null : Math.max(0, coupon.maxUses - coupon.uses) } : null}
    referral={{ friend: REFERRAL_GRANT.referee, me: REFERRAL_GRANT.referrer, turns: REFERRAL_GRANT.afterTurns }} />
}
