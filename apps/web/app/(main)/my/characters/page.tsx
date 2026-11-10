import { redirect } from 'next/navigation'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { characters, db, worlds } from '@miro/db'
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
    isPublic: characters.isPublic, isDraft: characters.isDraft,
  })
    .from(characters).leftJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(eq(characters.ownerId, user.id), isNull(characters.deletedAt)))
    .orderBy(desc(characters.createdAt))

  const [reward, byCharacter] = await Promise.all([creatorRewardSummary(user.id), creatorRewardByCharacter(user.id)])
  const earning = mine.flatMap(c => { const e = byCharacter.get(c.id); return e ? [{ id: c.id, name: c.name, ...e }] : [] })
    .sort((a, b) => (b.reward + b.cheer) - (a.reward + a.cheer))
  const shown = mine.filter((c) =>
    filter === 'all' ? true : filter === 'public' ? c.isPublic && !c.isDraft : filter === 'private' ? !c.isPublic && !c.isDraft : c.isDraft)
  const cards: CardCharacter[] = shown.map((c) => ({
    ...c, slug: c.slug ?? c.id,
    caption: c.isDraft ? t('임시저장') : c.isPublic ? t('공개') : t('비공개'),
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
          <TransitionLink href="/my/characters/payout" className="t-caption" style={{ display: 'block', marginTop: 2, color: 'var(--color-accent)', fontWeight: 600 }}>{t('출금 신청')}</TransitionLink>
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
