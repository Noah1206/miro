import { redirect } from 'next/navigation'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { characterLikes, characters, db, worlds } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { Back, Page, TransitionLink } from '@/components/ui'
import { CharacterCard, type CardCharacter } from '@/components/character-card'
import { getT } from '@/lib/i18n/server'
import { SectionLinks } from '@/components/ui/section-links'
import styles from '../characters/characters.module.css'

/**
 * 11/16 좋아요한 캐릭터 — 누른 순(최근 먼저)으로 보고 장르로 거른다.
 * 커뮤니티 조사: 좋아요 목록이 제작순이라 찾기 힘들고 태그로 묶어 보고 싶다는 요구가 많았다(미로엔 목록 자체가 없었다).
 * ponytail: 폴더는 없다 — 장르 칩으로 부족해지면 그때.
 */
export default async function MyLikes({ searchParams }: { searchParams: Promise<{ genre?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { genre } = await searchParams
  const t = await getT()

  const liked = await db.select({
    id: characters.id, slug: characters.slug, name: characters.name, tagline: characters.tagline,
    accentA: characters.accentA, genre: worlds.genre, relationshipKeywords: characters.relationshipKeywords, images: characters.images,
  })
    .from(characterLikes).innerJoin(characters, eq(characters.id, characterLikes.characterId)).leftJoin(worlds, eq(worlds.characterId, characters.id))
    // 비공개로 바뀐 남의 작품은 숨긴다(내 것은 보인다).
    .where(and(eq(characterLikes.userId, user.id), isNull(characters.deletedAt), eq(characters.isDraft, false), or(eq(characters.isPublic, true), eq(characters.ownerId, user.id))))
    .orderBy(desc(characterLikes.createdAt))

  const genres = [...new Set(liked.map(c => c.genre?.trim()).filter((g): g is string => !!g))].slice(0, 12)
  const active = genre && genres.includes(genre) ? genre : 'all'
  const cards: CardCharacter[] = liked.filter(c => active === 'all' || c.genre?.trim() === active).map(c => ({ ...c, slug: c.slug ?? c.id }))

  return (
    <Page wide className={styles.page}>
      <div className={styles.frame}>
        <header className={styles.header}><Back href="/my" /><h1>{t('좋아요한 캐릭터')}</h1></header>
        {genres.length > 1 && <SectionLinks fullBleed label={t('장르')} active={active}
          items={[{ key: 'all', label: t('전체'), href: '/my/likes' }, ...genres.map(g => ({ key: g, label: g, href: `/my/likes?genre=${encodeURIComponent(g)}` }))]} />}
        {cards.length === 0 ? (
          <section className={styles.empty} aria-label={t('좋아요한 캐릭터')}>
            <h2>{t('아직 좋아요한 캐릭터가 없어요')}</h2>
            <TransitionLink href="/home" className={styles.createLink}>{t('둘러보기')}</TransitionLink>
          </section>
        ) : (
          <>
            <div className={styles.summary}><span>{t('{n}개', { n: cards.length })}</span></div>
            <div className="grid-2">{cards.map(c => <CharacterCard key={c.id} c={c} />)}</div>
          </>
        )}
      </div>
    </Page>
  )
}
