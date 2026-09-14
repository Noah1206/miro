import { redirect } from 'next/navigation'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { characters, db, roleplaySessions, worlds } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { ButtonLink, Page, TransitionLink } from '@/components/ui'
import { CharacterCard, type CardCharacter } from '@/components/character-card'
import { ProfileCard } from './profile-card'

type Filter = 'all' | 'public' | 'private' | 'draft'
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: '전체' }, { key: 'public', label: '공개' }, { key: 'private', label: '비공개' }, { key: 'draft', label: '임시저장' },
]

/**
 * 마이페이지 (레퍼런스 구조): 프로필 카드 → 내 캐릭터(필터·목록) → 설정 → 푸터.
 * 요금제·사용량은 '구독 관리' 에 있다 — 여기 카드로 두면 매번 구독 권유를 보는 셈이다.
 * 팔로우·프로필 공유·회사 정보처럼 실체가 없는 것은 넣지 않는다.
 */
export default async function MyPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { filter: rawFilter } = await searchParams
  const filter: Filter = (FILTERS.some((f) => f.key === rawFilter) ? rawFilter : 'all') as Filter

  const handle = user.email?.split('@')[0] ?? 'me'
  const name = user.displayName ?? handle

  const [mine, [sessions]] = await Promise.all([
    db.select({
      id: characters.id, slug: characters.slug, name: characters.name, tagline: characters.tagline,
      accentA: characters.accentA, genre: worlds.genre, relationshipKeywords: characters.relationshipKeywords,
      isPublic: characters.isPublic, isDraft: characters.isDraft,
      plays: sql<number>`(select count(distinct s.user_id)::int from roleplay_sessions s where s.character_id = ${characters.id} and s.deleted_at is null)`,
    })
      .from(characters).leftJoin(worlds, eq(worlds.characterId, characters.id))
      .where(and(eq(characters.ownerId, user.id), isNull(characters.deletedAt)))
      .orderBy(desc(characters.createdAt)),
    db.select({ n: sql<number>`count(*)::int` }).from(roleplaySessions)
      .where(and(eq(roleplaySessions.userId, user.id), eq(roleplaySessions.status, 'active'), isNull(roleplaySessions.deletedAt))),
  ])

  const shown = mine.filter((c) =>
    filter === 'all' ? true : filter === 'public' ? c.isPublic && !c.isDraft : filter === 'private' ? !c.isPublic && !c.isDraft : c.isDraft)
  const cards: CardCharacter[] = shown.map((c) => ({
    ...c, slug: c.slug ?? c.id,
    caption: c.isDraft ? '임시저장' : c.isPublic ? '공개' : '비공개',
    href: c.isDraft ? `/my/characters/${c.id}/edit` : undefined,
  }))


  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
        <h1 className="t-title-1">마이페이지</h1>
        <TransitionLink href="/my/settings" aria-label="설정"
          style={{ width: 40, height: 40, marginRight: -8, borderRadius: 20, display: 'grid', placeItems: 'center', color: 'var(--color-text-secondary)' }}>
          <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </TransitionLink>
      </div>

      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        <ProfileCard name={name} handle={handle} stats={[
          { label: '캐릭터', value: mine.length },
          { label: '공개', value: mine.filter((c) => c.isPublic && !c.isDraft).length },
          { label: '대화 중', value: sessions?.n ?? 0 },
        ]} />
      </div>

      {/* 내 캐릭터 — 레퍼런스의 '작품' 탭. 칩으로 거른다. */}
      <section style={{ marginTop: 'var(--space-7)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-4)' }}>
          {FILTERS.map((f) => {
            const on = f.key === filter
            return (
              <TransitionLink key={f.key} href={f.key === 'all' ? '/my' : `/my?filter=${f.key}`} aria-current={on ? 'true' : undefined}
                style={{
                  padding: '8px 14px', borderRadius: 'var(--radius-button)', fontSize: 'var(--font-caption)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                  background: on ? 'var(--color-white)' : 'var(--color-surface-1)', color: on ? 'var(--color-black)' : 'var(--color-text-secondary)',
                }}>{f.label}</TransitionLink>
            )
          })}
        </div>
        {/* 칩이 이미 무엇인지 말한다 — 제목은 개수만 작고 옅게. */}
        <h2 className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>{shown.length}개</h2>
        {cards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            <p className="t-body" style={{ marginBottom: 14 }}>{name}님이 만든 캐릭터가 {filter === 'all' ? '아직 없어요' : '여기엔 없어요'}.</p>
            {filter === 'all' && <ButtonLink href="/create" variant="primary">한 사람 만들기</ButtonLink>}
          </div>
        ) : (
          <div className="grid-2">{cards.map((c) => <CharacterCard key={c.id} c={c} />)}</div>
        )}
      </section>

      {/* 푸터 — 실제로 있는 문서만. 회사 정보는 정해진 것이 없어 적지 않는다. */}
      <footer style={{ marginTop: 'var(--space-8)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--color-border)' }}>
        <p className="t-name" style={{ fontSize: 'var(--font-title-3)', color: 'var(--color-text-tertiary)', marginBottom: 12 }}>MIRO</p>
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
          <TransitionLink href="/terms/service">서비스 이용약관</TransitionLink>
          <span aria-hidden>|</span>
          <TransitionLink href="/terms/privacy">개인정보 처리방침</TransitionLink>
          <span aria-hidden>|</span>
          <TransitionLink href="/terms/ai">AI 생성 콘텐츠 안내</TransitionLink>
        </p>
      </footer>
    </Page>
  )
}
