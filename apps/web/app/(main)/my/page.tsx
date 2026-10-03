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
import { logout } from './actions'
import { MenuRow, MenuSection } from './menu'
import homeStyles from '../home/home.module.css'
import { CharacterPhoto } from '@/components/character-visual'
import { CreditCard } from './credit-card'
import { ProfileEditor } from './profile-editor'
import styles from './my.module.css'

/**
 * '나' 화면(2026-09-30, WHIF 프로필 모양): 로고(알림 종·설정 톱니는 10/1 뺐다) → 프로필 줄(연필 = 닉네임·프로필 사진 시트) → 숫자 카드 → 크레딧 카드 → 푸터.
 * Miro 에 없는 것(팔로워·팔로잉, 친구 초대, 구독 배너, 테마 상점, 세이프)은 넣지 않는다. 활동 목록(만들기·내가 만든 캐릭터·이용권·설정)은
 * 같은 날 뺐다 — 설정만 머리의 톱니로 남긴다(언어·계정 삭제로 가는 유일한 길). 내가 만든 캐릭터 목록은 /my/characters 에 있다.
 */
export default async function MyPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [t, language] = await Promise.all([getT(), getLanguage()])

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
    <Page wide>
      <h1 className="sr-only">{t('마이페이지')}</h1>
      <header className={styles.top}>
        <span className={homeStyles.headerItem} style={{ display: 'block' }}><LogoMark size={30} /></span>
      </header>

      <section className={styles.profile}>
        <span className={styles.avatar} aria-hidden>
          {avatarUrl ? <CharacterPhoto src={avatarUrl} alt="" size="avatar" sizes="64px" width={64} height={64} loading="eager" /> : <LogoMark size={28} />}
        </span>
        <div className={styles.who}>
          <p className={styles.name}>{name}</p>
          {user.email && <p className={styles.email}>{user.email}</p>}
        </div>
        <ProfileEditor nickname={name} avatarUrl={avatarUrl} />
      </section>

      <dl className={styles.stats}>
        {stats.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value.toLocaleString()}</dd></div>)}
      </dl>

      <CreditCard initial={wallet} />

      {/* 아래 메뉴 — 설정 페이지를 여기로 옮겼다(2026-10-01). 고객센터는 운영자 정보(lib/legal/operator.ts)의 문의 이메일로 연다.
          계정 삭제는 일반 항목과 떨어뜨려 맨 아래 문서 줄에 둔다(패턴 문서 §9.6) — 삭제 화면이 영향과 확인을 다시 묻는다. */}
      <footer style={{ marginTop: 'var(--space-8)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--color-border)' }}>
        <MenuSection title={t('설정')}>
          <MenuRow href="/my/language" label={t('언어')} sub={LANGUAGES[language]} />
          <MenuRow href="/my/subscription" label={t('이용권 관리')} />
          <MenuRow href="/my/verify" label={t('성인 인증')} />
          <MenuRow href="/my/permissions" label={t('권한 안내')} />
          <form action={logout}>
            <SubmitButton full variant="ghost" style={{ justifyContent: 'flex-start', minHeight: 0, padding: '12px 0', border: 0, borderRadius: 0, fontSize: 'var(--font-body-size)', lineHeight: 1.6, fontWeight: 'var(--weight-regular)' }}>
              {t('로그아웃')}
            </SubmitButton>
          </form>
        </MenuSection>
        <MenuSection title={t('고객지원')}>
          <MenuRow href={`mailto:${OPERATOR.email}`} label={t('문의하기')} sub={OPERATOR.email} />
        </MenuSection>
        <p className="t-name" style={{ fontSize: 'var(--font-title-3)', color: 'var(--color-text-tertiary)', margin: 'var(--space-6) 0 12px' }}>MIRO</p>
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px' }}>
          <TransitionLink href="/my/ai-data" className="hit">{t('AI 개선 참여')}</TransitionLink>
          <TransitionLink href="/terms/service" className="hit">{t('서비스 이용약관')}</TransitionLink>
          <span aria-hidden>|</span>
          <TransitionLink href="/terms/privacy" className="hit">{t('개인정보 처리방침')}</TransitionLink>
          <span aria-hidden>|</span>
          <TransitionLink href="/terms/ai" className="hit">{t('AI 생성 콘텐츠 안내')}</TransitionLink>
          <span aria-hidden>|</span>
          <TransitionLink href="/my/delete" className="hit">{t('계정 삭제')}</TransitionLink>
        </p>
      </footer>
    </Page>
  )
}
