import { redirect } from 'next/navigation'
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { characters, db, roleplaySessions, worlds } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { Back, Page, TransitionLink } from '@/components/ui'
import { CharacterCard, type CardCharacter } from '@/components/character-card'
import { msg } from '@/lib/i18n'
import { getT } from '@/lib/i18n/server'
import { SectionLinks } from '@/components/ui/section-links'
import styles from './characters.module.css'
import { MakeTabs } from './make-tabs'
import { creatorRewardByCharacter, creatorRewardSummary, CREATOR_REWARD_RATE } from '@/lib/usage/creator-reward'

type Filter = 'all' | 'public' | 'private' | 'draft'
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: msg('전체') }, { key: 'public', label: msg('공개') }, { key: 'private', label: msg('비공개') }, { key: 'draft', label: msg('임시저장') },
]

/** 내가 만든 캐릭터 — '나' 화면의 활동 목록에서 들어온다(2026-09-30, 예전엔 '나' 화면에 바로 있던 목록). 칩으로 거른다. */
export default async function MyCharacters({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { filter: rawFilter } = await searchParams
  const t = await getT()
  const filter: Filter = (FILTERS.some((f) => f.key === rawFilter) ? rawFilter : 'all') as Filter

  const mine = await db.select({
    id: characters.id, slug: characters.slug, name: characters.name, tagline: characters.tagline,
    accentA: characters.accentA, genre: worlds.genre, relationshipKeywords: characters.relationshipKeywords,
    images: characters.images,
    isPublic: characters.isPublic, linkShared: characters.linkShared, isDraft: characters.isDraft,
  })
    .from(characters).leftJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(eq(characters.ownerId, user.id), isNull(characters.deletedAt)))
    .orderBy(desc(characters.createdAt))

  const [reward, byCharacter] = await Promise.all([creatorRewardSummary(user.id), creatorRewardByCharacter(user.id)])
  // 11/16 작품별 대화 통계(커뮤니티 조사: 제작자에게 수익만 보여 주면 무엇이 통하는지 알 수 없다) — 내 테스트 방은 뺀다.
  const published = mine.filter(c => !c.isDraft).map(c => c.id)
  const stats = published.length ? await db.select({
    id: roleplaySessions.characterId, people: sql<number>`count(distinct ${roleplaySessions.userId})::int`,
    turns: sql<number>`coalesce(sum(${roleplaySessions.turnCount}), 0)::int`, rooms: sql<number>`count(*)::int`,
    stayed: sql<number>`count(*) filter (where ${roleplaySessions.turnCount} >= 10)::int`,
  }).from(roleplaySessions).where(and(inArray(roleplaySessions.characterId, published), ne(roleplaySessions.userId, user.id), sql`${roleplaySessions.turnCount} > 0`))
    .groupBy(roleplaySessions.characterId) : []
  const talked = stats.flatMap(r => { const c = mine.find(m => m.id === r.id); return c ? [{ ...r, name: c.name }] : [] }).sort((a, b) => b.people - a.people)
  const earning = mine.flatMap(c => { const e = byCharacter.get(c.id); return e ? [{ id: c.id, name: c.name, ...e }] : [] })
    .sort((a, b) => (b.reward + b.cheer) - (a.reward + a.cheer))
  const shown = mine.filter((c) =>
    filter === 'all' ? true : filter === 'public' ? c.isPublic && !c.isDraft : filter === 'private' ? !c.isPublic && !c.isDraft : c.isDraft)
  const cards: CardCharacter[] = shown.map((c) => ({
    ...c, slug: c.slug ?? c.id,
    caption: c.isDraft ? t('임시저장') : c.isPublic ? t('공개') : c.linkShared ? t('링크 공개') : t('비공개'),
    href: c.isDraft ? `/my/characters/${c.id}/edit` : undefined,
  }))

  return (
    <Page wide className={styles.page}>
      <div className={styles.frame}>
      <header className={styles.header}><Back href="/my" /><h1 className="sr-only">{t('내 캐릭터')}</h1><MakeTabs active="characters" /></header>
      {/* 11/11 창작 보상 1단계 — 다른 사람이 내 캐릭터와 대화하며 쓴 토큰의 일부가 미로 토큰으로 쌓인다. */}
      <section aria-label={t('창작 보상')} style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '4px 0 12px', padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
        <img src="/miro-token.svg" alt="" aria-hidden width={28} height={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 15 }}>{t('창작 보상')}</strong>
          <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('다른 사람이 내 캐릭터와 대화하면 쓴 토큰의 {rate}%가 내 지갑에 쌓여요.', { rate: Math.round(CREATOR_REWARD_RATE * 100) })}</span>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <strong style={{ display: 'block', fontSize: 17 }}>{t('이번 달 {n}', { n: reward.month.toLocaleString('ko-KR') })}</strong>
          <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('누적 {n}', { n: reward.total.toLocaleString('ko-KR') })}</span>
          <TransitionLink href="/earnings" className="t-caption" style={{ display: 'block', marginTop: 2, color: 'var(--color-accent)', fontWeight: 600 }}>{t('수익 지갑')}</TransitionLink>
        </div>
      </section>
      {/* 11/11 작품별 이번 달 수익 — 대화 보상과 받은 응원을 나눠서. */}
      {earning.length > 0 && (
        <section aria-label={t('작품별 이번 달 수익')} style={{ margin: '0 0 12px', padding: '10px 16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <strong className="t-caption" style={{ display: 'block', color: 'var(--color-text-secondary)', marginBottom: 6 }}>{t('작품별 이번 달 수익')}</strong>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {earning.map(e => (
              <li key={e.id} style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontSize: 14 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('대화 {n}', { n: e.reward.toLocaleString('ko-KR') })} · {t('응원 {n}', { n: e.cheer.toLocaleString('ko-KR') })}</span>
                <strong style={{ minWidth: 56, textAlign: 'right' }}>{(e.reward + e.cheer).toLocaleString('ko-KR')}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      {talked.length > 0 && (
        <section aria-label={t('작품별 대화 통계')} style={{ margin: '0 0 12px', padding: '10px 16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <strong className="t-caption" style={{ display: 'block', color: 'var(--color-text-secondary)', marginBottom: 6 }}>{t('작품별 대화 통계')}</strong>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {talked.map(r => (
              <li key={r.id} style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontSize: 14 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('{n}명', { n: r.people.toLocaleString('ko-KR') })} · {t('평균 {n}턴', { n: Math.round(r.turns / r.rooms).toLocaleString('ko-KR') })} · {t('10턴 넘긴 방 {n}%', { n: Math.round(100 * r.stayed / r.rooms) })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* 11/16 만드는 사람에게 하는 약속 — 커뮤니티에서 제작자가 떠나는 이유 세 가지(독점 강요·비공개 작품 개입·이유 없는 조치)를 하지 않는다고 적어 둔다. */}
      <p className="t-caption" style={{ margin: '0 0 12px', color: 'var(--color-text-tertiary)', lineHeight: 1.7 }}>
        {t('미로는 독점을 요구하지 않아요. 비공개 캐릭터의 설정은 운영이 고치거나 지우지 않아요. 공개 작품에 조치가 필요하면 이유를 알려 드려요.')}
      </p>
      <SectionLinks fullBleed label={t('내가 만든 캐릭터')} active={filter}
        items={FILTERS.map(f => ({ key: f.key, label: t(f.label), href: f.key === 'all' ? '/my/characters' : `/my/characters?filter=${f.key}` }))} />
      {cards.length === 0 ? (
        <section className={styles.empty} aria-label={t('캐릭터 목록')}>
          <h2>{mine.length === 0 ? t('나만의 캐릭터를\n직접 만들어 볼까요?') : filter === 'draft' ? t('작성 중인 캐릭터가 없어요') : filter === 'private' ? t('비공개 캐릭터가 없어요') : t('공개한 캐릭터가 없어요')}</h2>
          {mine.length > 0 && <p>{t('다른 분류에서 캐릭터를 확인해 보세요.')}</p>}
          <TransitionLink href={mine.length === 0 ? '/create' : '/my/characters'} className={styles.createLink}>
            {mine.length === 0 && <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
            {mine.length === 0 ? t('캐릭터 만들기') : t('전체 보기')}
          </TransitionLink>
        </section>
      ) : (
        <>
          <div className={styles.summary}><span>{t('{n}개', { n: shown.length })}</span><TransitionLink href="/create">+ {t('새로 만들기')}</TransitionLink></div>
          <div className="grid-2">{cards.map((c) => <CharacterCard key={c.id} c={c} />)}</div>
        </>
      )}
      </div>
    </Page>
  )
}
