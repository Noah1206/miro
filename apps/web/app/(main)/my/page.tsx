import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { Page, TransitionLink } from '@/components/ui'
import { accountProfile } from '@/lib/account-profile'
import { walletSnapshot } from '@/lib/wallet/service'
import { getLanguage, getT } from '@/lib/i18n/server'
import { OPERATOR } from '@/lib/legal/operator'
import { SubmitButton } from '@/components/ui/submit-button'
import { SiteFooter } from '@/components/site-footer'
import { logout } from './actions'
import { MenuRow, MenuSection } from './menu'
import { CreditCard } from './credit-card'
import { AttendanceCard } from './attendance-card'
import { attendanceStatus } from '@/lib/attendance'
import { ProfileIdentity } from './profile-editor'
import { ProfileIcon } from './profile-icon'
import { faqList } from '@/lib/faq'
import styles from './my.module.css'

/** Account overview: identity, real wallet balance, activity, settings and support. */
export default async function MyPage({ searchParams }: { searchParams: Promise<{ verify?: string; r?: string; coupon?: string }> }) {
  const user = await currentUser()
  // 11/18 이벤트 페이지의 '미로에서 쓰러 가기'(/my?coupon=…) — 로그인 뒤 쿠폰 칸이 채워진 채로 돌아오게.
  // 11/19 쿠폰 칸은 토큰 페이지(/my/subscription)로 옮겼다 — 예전 링크는 그리로 넘긴다.
  const coupon = (await searchParams).coupon?.trim().slice(0, 40) || null
  if (coupon) redirect(`/my/subscription?coupon=${encodeURIComponent(coupon)}`)
  if (!user) redirect('/login?next=/my')
  // 11/20 본인인증 줄은 설정 페이지로 옮겼다 — 인증을 마치고 돌아오는 예전 주소는 그리로 넘긴다.
  const { verify, r } = await searchParams
  if (verify === '1') redirect(`/my/settings?verify=1${r ? `&r=${encodeURIComponent(r)}` : ''}`)
  const [t, language] = await Promise.all([getT(), getLanguage()])

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
        <MenuSection title={t('고객지원')}>
          <MenuRow href={`mailto:${OPERATOR.email}`} label={t('문의하기')} icon="help" />{/* 11/12 사용자: 이메일 주소는 표시하지 않음(누르면 메일 앱) */}
          <MenuRow href="/my/ai-data" label={t('AI 개선 참여')} icon="data" />
        </MenuSection>
        {/* 11/13 사용자: 홈에 있던 자주 묻는 질문을 프로필 섹션으로. 원문 한국어라 한국어 화면에서만. */}
        {language === 'ko' && <MenuSection title="자주 묻는 질문">
          {faqList().map(([q, a]) => (
            <details key={q} className={styles.faq}>
              <summary className={styles.row}><span className={styles.rowCopy}><span className={styles.rowLabel}>{q}</span></span><span className={styles.chevron}><ProfileIcon name="chevron" size={16} /></span></summary>
              <p>{a}</p>
            </details>
          ))}
        </MenuSection>}
      </div>
      <div className={styles.accountActions}>
        <form action={logout}><SubmitButton variant="ghost" size="sm" style={{ color: 'var(--profile-muted)', fontSize: 13, fontWeight: 450, padding: '8px 0' }}>{t('로그아웃')}</SubmitButton></form>
        <span aria-hidden="true">·</span><TransitionLink href="/my/delete">{t('계정 삭제')}</TransitionLink>
      </div>
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
      </div>
    </Page>
  )
}
