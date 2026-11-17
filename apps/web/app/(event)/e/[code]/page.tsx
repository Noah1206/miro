import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { coupons, db } from '@miro/db'
import { REFERRAL_GRANT } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { myReferral, REF_COOKIE } from '@/lib/referral'
import { EventCoupon } from './coupon'

/**
 * 11/18 이벤트 쿠폰 페이지 miroapp.app/e/<쿠폰> — 앱 껍데기(내비·사이드바) 없이 한 장. 로그인 없이 '발급받기'를 누르면 코드가 복사되고,
 * 바로 밑 '미로에서 쓰기'(프로필 쿠폰 칸에 코드가 채워진 채로 열림)와 '공유하기'. 로그인해 있으면 공유 링크가 내 초대 링크(/r/<내 코드>)다.
 */
const norm = (s: string) => decodeURIComponent(s).trim().toUpperCase().replace(/\s+/g, '').slice(0, 40)

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const code = norm((await params).code)
  const title = '미로 오픈 이벤트 — 무료 토큰 + 친구 추천'
  const description = '캐릭터 대사를 목소리로 듣는 음성 캐릭터챗 미로. 쿠폰을 발급받아 무료 토큰을 받고, 친구에게 공유하면 친구도 나도 토큰을 받아요.'
  return { title: { absolute: title }, description, openGraph: { title, description, url: `/e/${code}`, images: [{ url: '/events/open-event.jpg', width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/events/open-event.jpg'] } }
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ invited?: string }> }) {
  const code = norm((await params).code)
  const [user, jar, query] = await Promise.all([currentUser(), cookies(), searchParams])
  const [coupon] = await db.select({ units: coupons.units, validDays: coupons.validDays, maxUses: coupons.maxUses, uses: coupons.uses, endsAt: coupons.endsAt })
    .from(coupons).where(eq(coupons.code, code)).limit(1)
  const open = !!coupon && (!coupon.endsAt || coupon.endsAt > new Date()) && (coupon.maxUses === null || coupon.uses < coupon.maxUses)
  const myCode = user ? (await myReferral(user.id)).code : null
  return <EventCoupon code={code} myCode={myCode} invited={query.invited === '1' || !!jar.get(REF_COOKIE)}
    coupon={coupon ? { units: coupon.units, validDays: coupon.validDays, open, left: coupon.maxUses === null ? null : Math.max(0, coupon.maxUses - coupon.uses) } : null}
    referral={{ friend: REFERRAL_GRANT.referee, me: REFERRAL_GRANT.referrer, turns: REFERRAL_GRANT.afterTurns }} />
}
