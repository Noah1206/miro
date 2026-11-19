import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { walletSnapshot } from '@/lib/wallet/service'
import { myReferral } from '@/lib/referral'
import { Page, PageHeader } from '@/components/ui'
import { Wallet } from '@/components/wallet/wallet'
import { getT } from '@/lib/i18n/server'
import { CouponCard } from '../coupon-card'
import styles from '../my.module.css'

/** 토큰 페이지 — 프로필의 보유 토큰 카드를 누르면 온다. 11/19 쿠폰·추천인 코드 칸도 여기(프로필에서 옮김). ?coupon= 이면 칸이 채워진 채로. */
export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ coupon?: string }> }) {
  const user = await currentUser()
  const coupon = (await searchParams).coupon?.trim().slice(0, 40) || null
  if (!user) redirect(`/login?next=${encodeURIComponent(`/my/subscription${coupon ? `?coupon=${encodeURIComponent(coupon)}` : ''}`)}`)
  const [wallet, referral, t] = await Promise.all([walletSnapshot(user.id), myReferral(user.id), getT()])
  return <Page style={{ maxWidth: 480 }}>
    <PageHeader back="/my" title={t('토큰 사용 내역')} />
    <Wallet initial={wallet} />
    <div className={styles.tokenVars} style={{ marginTop: 16 }}><CouponCard referral={referral} initialCode={coupon} /></div>
  </Page>
}
