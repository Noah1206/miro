'use client'
import { useState } from 'react'
import { Button, TransitionLink } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import { compact } from '@/lib/format'
import type { CardPage, HomeCard } from '@/lib/home'
import styles from './home.module.css'

const unique = (items: HomeCard[]) => [...new Map(items.map(c => [c.id, c])).values()]
const picture = (c: HomeCard) => c.images[0] ?? null

function PhotoDetails({ c }: { c: HomeCard }) {
  const tags = [...new Set([...(c.genre ?? '').split('·').map(t => t.trim()), ...c.relationshipKeywords])].filter(Boolean).slice(0, 2)
  return <>
    <span className={styles.cardBadges}>
    {c.plays > 0 && <span className={styles.plays} aria-label={`대화한 사람 ${c.plays}명`}>
      <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2V11.5a10 10 0 0 1 20 0Z" /></svg>
      {compact(c.plays)}
    </span>}
    </span>
    <span className={styles.photoDetails}>
      <strong>{c.name}</strong>
      {(c.tagline || c.role) && <span className={styles.photoTagline}>{c.tagline || c.role}</span>}
      {tags.length > 0 && <span className={styles.photoTags}>{tags.map(t => `#${t.replace(/\s+/g, '')}`).join('  ')}</span>}
    </span>
  </>
}
function StoryCard({ c }: { c: HomeCard }) {
  return <TransitionLink className={styles.story} href={`/character/${c.slug || c.id}`} aria-label={`${c.name}, ${c.role || '이야기 살펴보기'}`}>
    <div className={styles.poster}>
      <CharacterVisual name={c.name} accent={c.accentA} slug={c.slug || c.id} photo={picture(c)} ratio="2 / 3" shared={false} scrim={false} style={{ borderRadius: 0 }} />
      <PhotoDetails c={c} />
    </div>
  </TransitionLink>
}

export function HomeFeed({ initial }: { initial: CardPage }) {
  const [filter, setFilter] = useState<'all' | 'popular'>('all')
  const [items, setItems] = useState(initial.items)
  const [cursor, setCursor] = useState(initial.nextCursor)
  const [popular, setPopular] = useState<HomeCard[] | null>(null)
  const [moreLoading, setMoreLoading] = useState(false)
  const [popularLoading, setPopularLoading] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const [popularError, setPopularError] = useState(false)
  const recommendations = filter === 'popular' ? popular ?? [] : items
  const loading = filter === 'popular' ? popularLoading : moreLoading
  const error = filter === 'popular' ? popularError : moreError
  const empty = recommendations.length === 0 && !loading && !error

  async function loadMore() {
    if (!cursor || moreLoading) return
    setMoreLoading(true); setMoreError(false)
    try {
      const response = await fetch(`/api/home/cards?cursor=${encodeURIComponent(cursor)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('LOAD_FAILED')
      const page: CardPage = await response.json()
      setItems(current => unique([...current, ...page.items]))
      setCursor(page.nextCursor)
    } catch { setMoreError(true) } finally { setMoreLoading(false) }
  }

  async function showPopular() {
    setFilter('popular')
    if (popular || popularLoading) return
    setPopularLoading(true); setPopularError(false)
    try {
      const response = await fetch('/api/home/cards?sort=popular', { cache: 'no-store' })
      if (!response.ok) throw new Error('LOAD_FAILED')
      setPopular(await response.json())
    } catch { setPopularError(true) } finally { setPopularLoading(false) }
  }

  return <div className={`${styles.feed} ${empty ? styles.fill : ''}`}>
    <h1 className="sr-only">홈</h1>
    <div className={styles.filters} role="group" aria-label="이야기 정렬">
      <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>전체</button>
      <button type="button" aria-pressed={filter === 'popular'} onClick={showPopular}>인기</button>
    </div>

    <section aria-labelledby="recommend-title" className={empty ? styles.fill : undefined}>
      <div className={styles.sectionHeading}><h2 id="recommend-title">{filter === 'popular' ? '인기 이야기' : '전체 이야기'}</h2></div>
      <div className={styles.grid}>{recommendations.map(c => <StoryCard key={c.id} c={c} />)}</div>
      {loading && <p role="status">불러오는 중</p>}
      {error && <p role="alert">목록을 불러오지 못했어요. <Button type="button" size="sm" variant="ghost" onClick={filter === 'popular' ? showPopular : loadMore}>다시 시도</Button></p>}
      {empty && <p className="empty-state empty-state--fill">{filter === 'popular' ? '아직 인기 이야기가 없어요' : '아직 이야기가 없어요'}</p>}
      {filter === 'all' && cursor && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-5)' }}><Button type="button" variant="secondary" onClick={loadMore} disabled={moreLoading}>{moreLoading ? '불러오는 중' : '더 보기'}</Button></div>}
    </section>

  </div>
}
