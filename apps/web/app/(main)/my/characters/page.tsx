import { redirect } from 'next/navigation'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { characters, db, worlds } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { Page, PageHeader, TransitionLink } from '@/components/ui'
import { CharacterCard, type CardCharacter } from '@/components/character-card'
import { msg } from '@/lib/i18n'
import { getT } from '@/lib/i18n/server'

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
  const name = user.displayName ?? user.email?.split('@')[0] ?? 'me'

  const mine = await db.select({
    id: characters.id, slug: characters.slug, name: characters.name, tagline: characters.tagline,
    accentA: characters.accentA, genre: worlds.genre, relationshipKeywords: characters.relationshipKeywords,
    images: characters.images,
    isPublic: characters.isPublic, isDraft: characters.isDraft,
  })
    .from(characters).leftJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(eq(characters.ownerId, user.id), isNull(characters.deletedAt)))
    .orderBy(desc(characters.createdAt))

  const shown = mine.filter((c) =>
    filter === 'all' ? true : filter === 'public' ? c.isPublic && !c.isDraft : filter === 'private' ? !c.isPublic && !c.isDraft : c.isDraft)
  const cards: CardCharacter[] = shown.map((c) => ({
    ...c, slug: c.slug ?? c.id,
    caption: c.isDraft ? t('임시저장') : c.isPublic ? t('공개') : t('비공개'),
    href: c.isDraft ? `/my/characters/${c.id}/edit` : undefined,
  }))

  return (
    <Page wide>
      <PageHeader back="/my" title={t('내가 만든 캐릭터')} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-4)' }}>
        {FILTERS.map((f) => {
          const on = f.key === filter
          return (
            <TransitionLink key={f.key} href={f.key === 'all' ? '/my/characters' : `/my/characters?filter=${f.key}`} aria-current={on ? 'true' : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', minHeight: 44,
                padding: '8px 14px', borderRadius: 'var(--radius-button)', fontSize: 'var(--font-caption)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                background: on ? 'var(--color-white)' : 'var(--color-surface-1)', color: on ? 'var(--color-black)' : 'var(--color-text-secondary)',
              }}>{t(f.label)}</TransitionLink>
          )
        })}
      </div>
      {/* 칩이 이미 무엇인지 말한다 — 제목은 개수만 작고 옅게. */}
      <h2 className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>{t('{n}개', { n: shown.length })}</h2>
      {cards.length === 0 ? (
        <p className="empty-state">{filter === 'all' ? t('{name}님이 만든 캐릭터가 아직 없어요', { name }) : t('{name}님이 만든 캐릭터가 여기엔 없어요', { name })}</p>
      ) : (
        <div className="grid-2">{cards.map((c) => <CharacterCard key={c.id} c={c} />)}</div>
      )}
    </Page>
  )
}
