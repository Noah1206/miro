import { redirect } from 'next/navigation'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { characters, db, roleplaySessions, worlds } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { usageStatus } from '@/lib/usage/guard'
import { ButtonLink, Page, Stagger, StaggerItem, TransitionLink, Tip } from '@/components/ui'
import { CharacterCard, type CardCharacter } from '@/components/character-card'
import { COPY } from '@/lib/copy'
import { ProfileCard } from './profile-card'

type Filter = 'all' | 'public' | 'private' | 'draft'
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: '전체' }, { key: 'public', label: '공개' }, { key: 'private', label: '비공개' }, { key: 'draft', label: '임시저장' },
]

/**
 * 마이페이지 (레퍼런스 구조): 프로필 카드 → Pro → 사용량 → 내 캐릭터(필터·목록) → 설정 → 푸터.
 * 팔로우·프로필 공유·회사 정보처럼 실체가 없는 것은 넣지 않는다.
 * 사용량은 조용한 선 하나. 차감값을 강조하지 않는다 (명세서 6.1).
 */
export default async function MyPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { filter: rawFilter } = await searchParams
  const filter: Filter = (FILTERS.some((f) => f.key === rawFilter) ? rawFilter : 'all') as Filter

  const handle = user.email?.split('@')[0] ?? 'me'
  const name = user.displayName ?? handle

  const [u, mine, [sessions]] = await Promise.all([
    usageStatus(user.id),
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

  const pct = Math.round((u.remaining / u.limit) * 100)
  const reset = u.resetsAt ? `${u.resetsAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}에 초기화` : `첫 사용부터 ${u.windowHours}시간 단위로 초기화`
  const pro = u.plan === 'pro'

  return (
    <Page>
      <h1 className="t-title-1" style={{ marginBottom: 'var(--space-5)' }}>마이페이지</h1>
      <div style={{ marginBottom: 'var(--space-4)' }}><Tip id="my">알림·통화·야간 연락은 설정에서 끄고 켤 수 있어요.</Tip></div>

      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        <ProfileCard name={name} handle={handle} stats={[
          { label: '캐릭터', value: mine.length },
          { label: '공개', value: mine.filter((c) => c.isPublic && !c.isDraft).length },
          { label: '대화 중', value: sessions?.n ?? 0 },
        ]} />

        {/* Pro — 레퍼런스의 '제타패스' 자리. 이미 Pro 면 관리로. */}
        <section style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 'var(--space-5)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p data-plan={u.plan} className="t-title-3">MIRO {pro ? 'Pro' : 'Free'}</p>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
              {pro ? '더 많은 대화·사진·통화를 쓰고 있어요.' : '대화·사진·통화 한도를 늘려요.'}
            </p>
          </div>
          <ButtonLink href={pro ? '/my/subscription' : '/subscribe'} variant={pro ? 'secondary' : 'primary'}>{pro ? '관리' : '구독하기'}</ButtonLink>
        </section>

        {/* 사용량 — 레퍼런스의 '내 피스' 자리. */}
        <section style={{ padding: 'var(--space-5)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>남은 사용량</p>
              <p className="t-title-3" data-usage-remaining={u.remaining}>{pct}%</p>
            </div>
            <ButtonLink href="/plans" variant="secondary" size="sm">요금제 비교</ButtonLink>
          </div>
          <div role="meter" aria-label={COPY.a11y.usageMeter} aria-valuemin={0} aria-valuemax={u.limit} aria-valuenow={u.remaining} aria-valuetext={`${pct}% 남음`}
            style={{ height: 3, background: 'var(--color-surface-3)', overflow: 'hidden', borderRadius: 2 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-white)', transition: 'width var(--motion-slow) var(--ease-standard)' }} />
          </div>
          <p className="t-caption" style={{ marginTop: 10, color: 'var(--color-text-tertiary)' }}>{reset}</p>
        </section>
      </div>

      {/* 내 캐릭터 — 레퍼런스의 '작품' 탭. 칩으로 거른다. */}
      <section style={{ marginTop: 'var(--space-7)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-4)' }}>
          {FILTERS.map((f) => {
            const on = f.key === filter
            return (
              <TransitionLink key={f.key} href={f.key === 'all' ? '/my' : `/my?filter=${f.key}`} aria-current={on ? 'true' : undefined}
                style={{
                  padding: '8px 14px', borderRadius: 999, fontSize: 'var(--font-caption)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                  background: on ? 'var(--color-white)' : 'var(--color-surface-1)', color: on ? 'var(--color-black)' : 'var(--color-text-secondary)',
                }}>{f.label}</TransitionLink>
            )
          })}
        </div>
        <h2 className="t-title-3" style={{ marginBottom: 12 }}>캐릭터 목록 <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 'var(--weight-regular)' }}>{shown.length}</span></h2>
        {cards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            <p className="t-body" style={{ marginBottom: 14 }}>{name}님이 만든 캐릭터가 {filter === 'all' ? '아직 없어요' : '여기엔 없어요'}.</p>
            {filter === 'all' && <ButtonLink href="/create" variant="primary">한 사람 만들기</ButtonLink>}
          </div>
        ) : (
          <div className="grid-2">{cards.map((c) => <CharacterCard key={c.id} c={c} />)}</div>
        )}
      </section>

      <Stagger as="div" className="stack" style={{ gap: 8, marginTop: 'var(--space-7)' }}>
        {[['/my/subscription', '구독 관리'], ['/my/settings', '알림 · 통화 · 야간 연락'], ['/my/verify', '성인 인증'], ['/my/permissions', '권한 안내']].map(([h, l]) => (
          <StaggerItem key={h}><Row href={h!} label={l!} /></StaggerItem>
        ))}
        <StaggerItem><Row href="/my/delete" label="계정 삭제" danger /></StaggerItem>
      </Stagger>

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

function Row({ href, label, danger }: { href: string; label: string; danger?: boolean }) {
  return (
    <TransitionLink href={href} className="hoverable" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-1)', color: danger ? 'var(--color-danger)' : 'inherit' }}>
      <span className="t-body">{label}</span>
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}><path d="M9 5l7 7-7 7" /></svg>
    </TransitionLink>
  )
}
