import { redirect } from 'next/navigation'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, messages, roleplaySessions, users } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { LogoMark, Page, TransitionLink } from '@/components/ui'
import { getPersona } from '@/lib/persona'
import { walletSnapshot } from '@/lib/wallet/service'
import { unreadContactCount } from '@/lib/ops/archive'
import { getT } from '@/lib/i18n/server'
import { NotificationBell } from '../home/bell'
import homeStyles from '../home/home.module.css'
import { CharacterPhoto } from '@/components/character-visual'
import { CreditCard } from './credit-card'
import { ProfileEditor } from './profile-editor'
import styles from './my.module.css'

/**
 * '나' 화면(2026-09-30, WHIF 프로필 모양): 로고·알림·설정 → 프로필 줄(연필 = 닉네임·프로필 사진 시트) → 숫자 카드 → 크레딧 카드 → 푸터.
 * Miro 에 없는 것(팔로워·팔로잉, 친구 초대, 구독 배너, 테마 상점, 세이프)은 넣지 않는다. 활동 목록(만들기·내가 만든 캐릭터·이용권·설정)은
 * 같은 날 뺐다 — 설정만 머리의 톱니로 남긴다(언어·계정 삭제로 가는 유일한 길). 내가 만든 캐릭터 목록은 /my/characters 에 있다.
 */
export default async function MyPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const t = await getT()

  const [[sessions], [talk], persona, wallet, unread, [profile]] = await Promise.all([
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
    unreadContactCount(user.id),
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NotificationBell unread={unread} signedIn className={`hit ${homeStyles.headerItem} ${homeStyles.headerAction}`} />
          <TransitionLink href="/my/settings" aria-label={t('설정')} className={`hit ${homeStyles.headerItem} ${homeStyles.headerAction} ${styles.settings}`}>
            <svg aria-hidden width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </TransitionLink>
        </div>
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

      {/* 푸터 — 실제로 있는 문서만. 회사 정보는 정해진 것이 없어 적지 않는다. */}
      <footer style={{ marginTop: 'var(--space-8)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--color-border)' }}>
        <p className="t-name" style={{ fontSize: 'var(--font-title-3)', color: 'var(--color-text-tertiary)', marginBottom: 12 }}>MIRO</p>
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px' }}>
          <TransitionLink href="/my/ai-data" className="hit">{t('AI 개선 참여')}</TransitionLink>
          <TransitionLink href="/terms/service" className="hit">{t('서비스 이용약관')}</TransitionLink>
          <span aria-hidden>|</span>
          <TransitionLink href="/terms/privacy" className="hit">{t('개인정보 처리방침')}</TransitionLink>
          <span aria-hidden>|</span>
          <TransitionLink href="/terms/ai" className="hit">{t('AI 생성 콘텐츠 안내')}</TransitionLink>
        </p>
      </footer>
    </Page>
  )
}
