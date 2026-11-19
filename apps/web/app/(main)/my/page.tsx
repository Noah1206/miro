import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { LoginButton, LogoMark, Page, TransitionLink } from '@/components/ui'
import { accountProfile } from '@/lib/account-profile'
import { walletSnapshot } from '@/lib/wallet/service'
import { getT } from '@/lib/i18n/server'
import { SiteFooter } from '@/components/site-footer'
import { logout } from './actions'
import { MenuRow, MenuSection } from './menu'
import { CreditCard } from './credit-card'
import { AttendanceCard } from './attendance-card'
import { attendanceStatus } from '@/lib/attendance'
import { ProfileIdentity } from './profile-editor'
import { ProfileIcon } from './profile-icon'
import styles from './my.module.css'

/** Account overview: identity, real wallet balance, activity, settings and support. */
export default async function MyPage({ searchParams }: { searchParams: Promise<{ verify?: string; r?: string; coupon?: string }> }) {
  const user = await currentUser()
  // 11/18 이벤트 페이지의 '미로에서 쓰러 가기'(/my?coupon=…) — 로그인 뒤 쿠폰 칸이 채워진 채로 돌아오게.
  // 11/19 쿠폰 칸은 토큰 페이지(/my/subscription)로 옮겼다 — 예전 링크는 그리로 넘긴다.
  const coupon = (await searchParams).coupon?.trim().slice(0, 40) || null
  if (coupon) redirect(`/my/subscription?coupon=${encodeURIComponent(coupon)}`)
  const t = await getT()
  const legal = (
    <footer className={styles.legal}>
      <div className={styles.legalLinks}>
        <TransitionLink href="/terms/service">{t('이용약관')}</TransitionLink>
        <TransitionLink href="/terms/privacy">{t('개인정보 처리방침')}</TransitionLink>
        <TransitionLink href="/terms/refund">{t('취소·환불 규정')}</TransitionLink>
      </div>
      <details className={styles.businessDetails}>
        <summary>{t('MIRO 사업자 정보')}<ProfileIcon name="chevron" size={14} /></summary>
        <SiteFooter style={{ marginTop: 8, padding: '16px 0 0', borderTop: '1px solid var(--profile-divider)' }} />
      </details>
    </footer>
  )
  // 11/20 사용자: 프로필 페이지까지는 로그인하지 않아도 보인다 — 계정 자리에 로그인 버튼, 지갑·출석·내 활동은 로그인 뒤에.
  if (!user) return (
    <Page wide className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}><h1>{t('프로필')}</h1></header>
        <section className={styles.identity} aria-label={t('내 프로필')}>
          <div className={styles.profile}>
            <span className={styles.avatar} aria-hidden><span className="avatar-default"><LogoMark size={28} label="" /></span></span>
            <div className={styles.who}><p className={styles.name}>{t('MIRO 로그인')}</p></div>
          </div>
          <LoginButton next="/my" variant="primary" full style={{ marginTop: 20 }}>{t('로그인하고 시작하기')}</LoginButton>
        </section>
        {legal}
      </div>
    </Page>
  )
  // 11/20 본인인증 줄은 설정 페이지로 옮겼다 — 인증을 마치고 돌아오는 예전 주소는 그리로 넘긴다.
  const { verify, r } = await searchParams
  if (verify === '1') redirect(`/my/settings?verify=1${r ? `&r=${encodeURIComponent(r)}` : ''}`)

  // 11/20 사용자: 만난 캐릭터·대화 중·총 대화량 숫자 줄을 뺐다(그 조회도 함께).
  const [profile, wallet, attendance] = await Promise.all([
    accountProfile(user),
    walletSnapshot(user.id),
    attendanceStatus(user.id),
  ])
  return (
    <Page wide className={styles.page}>
      <div className={styles.content}>
      <header className={styles.header}>
        <h1>{t('프로필')}</h1>
        <TransitionLink href="/my/settings" className={styles.settingsButton} aria-label={t('설정')}><ProfileIcon name="settings" size={24} /></TransitionLink>
      </header>
      <section className={styles.identity} aria-label={t('내 프로필')}>
      <ProfileIdentity initial={profile} email={user.email} />

      </section>

      <CreditCard initial={wallet} />
      <AttendanceCard initial={attendance} />

      <div className={styles.sections}>
        <MenuSection title={t('내 활동')}>
          <MenuRow href="/my/characters" label={t('내가 만든 캐릭터')} icon="characters" />
          <MenuRow href="/my/likes" label={t('좋아요한 캐릭터')} icon="heart" />
          <MenuRow href="/persona?next=/my" label={t('페르소나')} icon="persona" />
        </MenuSection>
        {/* 11/20 사용자: 로그아웃·계정 삭제를 한 블록으로 — 누르면 아래로 두 줄이 펼쳐진다. */}
        <details className={`${styles.menuItems} ${styles.faq}`}>
          <summary className={styles.row}><span className={styles.rowIcon}><ProfileIcon name="persona" /></span><span className={styles.rowCopy}><span className={styles.rowLabel}>{t('계정')}</span></span><span className={styles.chevron}><ProfileIcon name="chevron" size={16} /></span></summary>
          <form action={logout}><button type="submit" className={styles.row}><span className={styles.rowIcon}><ProfileIcon name="logout" /></span><span className={styles.rowCopy}><span className={styles.rowLabel}>{t('로그아웃')}</span></span></button></form>
          <TransitionLink href="/my/delete" className={styles.row}><span className={styles.rowIcon}><ProfileIcon name="trash" /></span><span className={styles.rowCopy}><span className={styles.rowLabel}>{t('계정 삭제')}</span></span></TransitionLink>
        </details>
      </div>
      {legal}
      </div>
    </Page>
  )
}
