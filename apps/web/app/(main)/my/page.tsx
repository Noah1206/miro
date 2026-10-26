import { redirect } from 'next/navigation'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, messages, roleplaySessions, users } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { LogoMark, Page, TransitionLink } from '@/components/ui'
import { getPersona } from '@/lib/persona'
import { walletSnapshot } from '@/lib/wallet/service'
import { LANGUAGES } from '@miro/domain'
import { getLanguage, getT } from '@/lib/i18n/server'
import { OPERATOR } from '@/lib/legal/operator'
import { SubmitButton } from '@/components/ui/submit-button'
import { SiteFooter } from '@/components/site-footer'
import { LegalRevisionNotice } from '@/components/legal-revision-notice'
import { logout } from './actions'
import { MenuItemContent, MenuRow, MenuSection } from './menu'
import { CharacterPhoto } from '@/components/character-visual'
import { CreditCard } from './credit-card'
import { ProfileEditor } from './profile-editor'
import { InstallAppButton } from '@/components/pwa-install'
import { ProfileIcon } from './profile-icon'
import { VerificationSheet } from './verify/verification-sheet'
import styles from './my.module.css'

/** Account overview: identity, real wallet balance, activity, settings and support. */
export default async function MyPage({ searchParams }: { searchParams: Promise<{ verify?: string; r?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [t, language] = await Promise.all([getT(), getLanguage()])
  const { verify, r } = await searchParams

  const [[sessions], [talk], persona, wallet, [profile]] = await Promise.all([
    // 만난 캐릭터 = 대화방을 연 캐릭터 수, 대화 중 = 이어지는 대화방 수(지운 방 제외).
    db.select({
      met: sql<number>`count(distinct ${roleplaySessions.characterId})::int`,
      active: sql<number>`(count(*) filter (where ${roleplaySessions.status} = 'active'))::int`,
    }).from(roleplaySessions).where(and(eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt))),
    // 총 대화량 = 내가 보낸 말 수.
    db.select({ n: sql<number>`count(*)::int` }).from(messages)
      .innerJoin(roleplaySessions, eq(roleplaySessions.id, messages.sessionId))
      .where(and(eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt), eq(messages.role, 'user'))),
    getPersona(user.id),
    walletSnapshot(user.id),
    db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, user.id)).limit(1),
  ])
  // 닉네임 = 온보딩에서 받은 이름(내 페르소나 이름, 캐릭터가 나를 부르는 이름). 없던 예전 계정은 계정 이름.
  const name = persona?.name ?? user.displayName ?? user.email?.split('@')[0] ?? 'me'
  const avatarUrl = profile?.avatarUrl ?? null
  const stats = [
    { label: t('만난 캐릭터'), value: sessions?.met ?? 0 },
    { label: t('대화 중'), value: sessions?.active ?? 0 },
    { label: t('총 대화량'), value: talk?.n ?? 0 },
  ]

  return (
    <Page wide className={styles.page}>
      <div className={styles.content}>
      <header className={styles.header}>
        <h1>{t('프로필')}</h1>
        <a href="#profile-settings" className={styles.settingsButton} aria-label={t('설정으로 이동')}><ProfileIcon name="settings" size={24} /></a>
      </header>
      <section className={styles.identity} aria-label={t('내 프로필')}>
      <div className={styles.profile}>
        <span className={styles.avatar} aria-hidden>
          {avatarUrl ? <CharacterPhoto src={avatarUrl} alt="" size="avatar" sizes="64px" width={64} height={64} loading="eager" /> : <LogoMark size={28} />}
        </span>
        <div className={styles.who}>
          <p className={styles.name}>{name}</p>
          {user.email && <p className={styles.email}>{user.email}</p>}
        </div>
        <ProfileEditor nickname={name} avatarUrl={avatarUrl} />
      </div>

      <dl className={styles.stats}>
        {stats.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value.toLocaleString()}</dd></div>)}
      </dl>
      </section>

      <CreditCard initial={wallet} />

      <div className={styles.sections}>
        <MenuSection title={t('내 활동')}>
          <MenuRow href="/my/characters" label={t('내가 만든 캐릭터')} icon="characters" />
          <MenuRow href="/persona?next=/my" label={t('대화 페르소나')} sub={t('새 대화에 적용되는 기본 설정')} icon="persona" />
        </MenuSection>
        <MenuSection title={t('앱 설정')} id="profile-settings">
          <InstallAppButton className={styles.row}><MenuItemContent label={t('홈 화면에 추가')} icon="download" /></InstallAppButton>
          <MenuRow href="/my/language" label={t('언어')} end={LANGUAGES[language]} icon="globe" />
          <VerificationSheet initiallyVerified={!!user.adultVerifiedAt} autoOpen={verify === '1'} result={r} />
          <MenuRow href="/my/permissions" label={t('알림·접근 권한')} icon="bell" />
        </MenuSection>
        <MenuSection title={t('고객지원')}>
          <MenuRow href={`mailto:${OPERATOR.email}`} label={t('문의하기')} sub={OPERATOR.email} icon="help" />
          <MenuRow href="/my/ai-data" label={t('AI 개선 참여')} icon="data" />
        </MenuSection>
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
        <LegalRevisionNotice style={{ marginTop: 12, borderRadius: 8 }} />
        <details className={styles.businessDetails}>
          <summary>{t('MIRO 사업자 정보')}<ProfileIcon name="chevron" size={14} /></summary>
          <SiteFooter style={{ marginTop: 8, padding: '16px 0 0', borderTop: '1px solid var(--profile-divider)' }} />
        </details>
      </footer>
      </div>
    </Page>
  )
}
