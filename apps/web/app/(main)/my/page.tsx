import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { Button, LoginTapArea, LogoMark, Page, TransitionLink } from '@/components/ui'
import { ATTENDANCE_GRANT } from '@miro/config'
import { accountProfile } from '@/lib/account-profile'
import { walletSnapshot } from '@/lib/wallet/service'
import { getT } from '@/lib/i18n/server'
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
      {/* 11/20 사용자: 약관은 작은 글씨 링크 대신 메뉴처럼 한 줄씩(줄마다 > ). */}
      <div className={styles.legalMenu}>
        <MenuSection title={t('약관 및 정책')}>
          <MenuRow href="/terms/service" label={t('이용약관')} icon="document" />
          <MenuRow href="/terms/privacy" label={t('개인정보 처리방침')} icon="lock" />
          <MenuRow href="/terms/refund" label={t('취소·환불 규정')} icon="receipt" />
        </MenuSection>
      </div>
    </footer>
  )
  // 11/20 사용자: 로그인 전에도 프로필은 로그인한 화면과 같은 모양으로 — 이름 자리에만 짧은 로그인 안내, 카드를 누르면 로그인 시트.
  if (!user) {
    const week = ATTENDANCE_GRANT.streakDays
    return (
      <Page wide className={styles.page}>
        <div className={styles.content}>
          <header className={styles.header}>
            <h1>{t('프로필')}</h1>
            <TransitionLink href="/my/settings" className={styles.settingsButton} aria-label={t('설정')}><ProfileIcon name="settings" size={24} /></TransitionLink>
          </header>
          <div className={`${styles.profileCard} ${styles.guestCard}`}>
            <section className={styles.identity} aria-label={t('내 프로필')}>
              <div className={styles.profile}>
                <span className={styles.avatar} aria-hidden><span className="avatar-default"><LogoMark size={28} label="" /></span></span>
                <div className={styles.who}><p className={styles.name}>{t('로그인하고 시작하기')}</p></div>
              </div>
            </section>
            <section className={styles.credit} aria-label={t('미로 토큰')}>
              <div className={styles.creditHeader}><h2>{t('보유 토큰')}</h2><span className={styles.historyLink}>{t('사용 내역')}<ProfileIcon name="chevron" size={14} /></span></div>
              <div className={styles.creditMain} style={{ marginBottom: 2 }}>
                <p className={styles.balance}><img src="/miro-token.svg" alt="" aria-hidden width={30} height={30} decoding="async" /><span>0</span></p>
                <Button type="button" variant="primary" size="sm" className={styles.chargeButton} style={{ borderRadius: 8, fontSize: 15 }} tabIndex={-1}>{t('충전하기')}</Button>
              </div>
            </section>
            <LoginTapArea label={t('로그인하고 시작하기')} className={styles.guestTap} />
          </div>
          <section className={`${styles.credit} ${styles.guestCard}`} aria-label={t('출석 체크')} style={{ marginTop: 12 }}>
            <div className={styles.creditHeader}><h2>{t('출석 체크')}</h2><span style={{ color: 'var(--profile-muted)', fontSize: 12 }}>{t('{days}일 연속', { days: 0 })}</span></div>
            <div className={styles.creditMain} style={{ marginBottom: 10, flexDirection: 'column', alignItems: 'stretch' }}>
              <ol aria-hidden style={{ display: 'flex', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
                {Array.from({ length: week }, (_, i) => <li key={i} style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 650, background: 'var(--profile-control)', color: 'var(--profile-muted)' }}>{i + 1}</li>)}
              </ol>
              <Button type="button" variant="primary" size="sm" className={styles.chargeButton} style={{ borderRadius: 8, fontSize: 15, width: '100%', background: '#fff', color: '#111015', borderColor: '#fff' }} tabIndex={-1}>{t('출석하기')}</Button>
            </div>
            <p style={{ margin: 0, color: 'var(--profile-muted)', fontSize: 12, lineHeight: 1.5 }}>
              {t('매일 {daily}토큰 · {week}일 연속이면 {bonus}토큰 더', { daily: ATTENDANCE_GRANT.daily.toLocaleString(), week, bonus: ATTENDANCE_GRANT.weeklyBonus.toLocaleString() })}
            </p>
            <LoginTapArea label={t('로그인하고 시작하기')} className={styles.guestTap} />
          </section>
          <div className={styles.sections}>
            <MenuSection title={t('내 활동')}>
              <MenuRow href="/my/characters" label={t('내가 만든 캐릭터')} icon="characters" />
              <MenuRow href="/my/likes" label={t('좋아요한 캐릭터')} icon="heart" />
              <MenuRow href="/persona?next=/my" label={t('페르소나')} icon="persona" />
            </MenuSection>
          </div>
          {legal}
        </div>
      </Page>
    )
  }
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
      {/* 11/20 사용자: 프로필(사진·이름)과 보유 토큰을 한 카드로. */}
      <div className={styles.profileCard}>
        <section className={styles.identity} aria-label={t('내 프로필')}>
          {/* 11/20 사용자: 이메일은 표시하지 않는다. */}
          <ProfileIdentity initial={profile} email={null} />
        </section>
        <CreditCard initial={wallet} />
      </div>
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
