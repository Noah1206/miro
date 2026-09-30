'use client'
import { useState } from 'react'
import { Button, TransitionLink } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import { compact } from '@/lib/format'
import { MOODS } from '@/lib/genres'
import type { CardPage, HomeCard } from '@/lib/home'
import styles from './home.module.css'
import { useLanguage, useT } from '@/lib/i18n/client'

const unique = (items: HomeCard[]) => [...new Map(items.map(c => [c.id, c])).values()]
const picture = (c: HomeCard) => c.images[0] ?? null

function PhotoDetails({ c }: { c: HomeCard }) {
  const t = useT()
  const language = useLanguage()
  const tags = [...new Set([...(c.genre ?? '').split('·').map(g => g.trim()), ...c.relationshipKeywords])].filter(Boolean).slice(0, 2)
  return <>
    <span className={styles.cardBadges}>
    {c.plays > 0 && <span className={styles.plays} aria-label={t('대화한 사람 {n}명', { n: c.plays })}>
      <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2V11.5a10 10 0 0 1 20 0Z" /></svg>
      {compact(c.plays, language)}
    </span>}
    </span>
    <span className={styles.photoDetails}>
      <strong>{c.name}</strong>
      {(c.tagline || c.role) && <span className={styles.photoTagline}>{c.tagline || c.role}</span>}
      {tags.length > 0 && <span className={styles.photoTags}>{tags.map(tag => `#${tag.replace(/\s+/g, '')}`).join('  ')}</span>}
    </span>
  </>
}
function StoryCard({ c }: { c: HomeCard }) {
  const t = useT()
  return <TransitionLink className={styles.story} href={`/character/${c.slug || c.id}`} aria-label={`${c.name}, ${c.role || t('이야기 살펴보기')}`}>
    <div className={styles.poster}>
      <CharacterVisual name={c.name} accent={c.accentA} slug={c.slug || c.id} photo={picture(c)} ratio="2 / 3" shared={false} scrim={false} style={{ borderRadius: 0 }} />
      <PhotoDetails c={c} />
    </div>
  </TransitionLink>
}

type Sort = 'all' | 'popular'
/** 정렬(전체·인기)과 고른 장르마다 목록을 따로 둔다 — 칩을 껐다 켜거나 전체·인기를 오가도 받은 목록은 다시 받지 않는다. */
const listKey = (sort: Sort, genres: string[]) => JSON.stringify([sort, genres])

export function HomeFeed({ initial }: { initial: CardPage }) {
  const [sort, setSort] = useState<Sort>('all')
  const [genres, setGenres] = useState<string[]>([])
  const [lists, setLists] = useState<Record<string, CardPage>>(() => ({ [listKey('all', [])]: initial }))
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const t = useT()
  const key = listKey(sort, genres)
  const list = lists[key]
  const recommendations = list?.items ?? []
  const busy = !!loading[key]
  const error = !!failed[key]
  const empty = !!list && recommendations.length === 0 && !busy && !error
  /** 처음 여는 목록(인기·장르)은 빈 채로 기다린다 — 글 대신 가운데에서 튕기는 점 세 개(2026-09-30 요청). */
  const waiting = !list && busy

  async function load(nextSort: Sort, nextGenres: string[], cursor: string | null = null) {
    const k = listKey(nextSort, nextGenres)
    if (loading[k]) return
    setLoading(current => ({ ...current, [k]: true })); setFailed(current => ({ ...current, [k]: false }))
    try {
      const params = new URLSearchParams(nextSort === 'popular' ? { sort: 'popular' } : cursor ? { cursor } : {})
      for (const genre of nextGenres) params.append('genre', genre)
      const response = await fetch(`/api/home/cards?${params}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('LOAD_FAILED')
      const body = await response.json()
      const page: CardPage = nextSort === 'popular' ? { items: body, nextCursor: null } : body
      setLists(current => ({ ...current, [k]: cursor && current[k] ? { items: unique([...current[k].items, ...page.items]), nextCursor: page.nextCursor } : page }))
    } catch { setFailed(current => ({ ...current, [k]: true })) } finally { setLoading(current => ({ ...current, [k]: false })) }
  }

  function show(nextSort: Sort, nextGenres: string[]) {
    setSort(nextSort); setGenres(nextGenres)
    if (!lists[listKey(nextSort, nextGenres)]) void load(nextSort, nextGenres)
  }
  // 칩 순서대로 모은다 — 같은 장르 묶음이 누른 순서 때문에 다른 목록이 되지 않게.
  const toggleGenre = (genre: string) => show(sort, MOODS.filter(mood => mood === genre ? !genres.includes(mood) : genres.includes(mood)))

  return <div className={`${styles.feed} ${empty || waiting ? styles.fill : ''}`}>
    <h1 className="sr-only">{t('홈')}</h1>
    <div className={styles.filters} role="group" aria-label={t('이야기 정렬')}>
      <button type="button" aria-pressed={sort === 'all'} onClick={() => show('all', genres)}>{t('전체')}</button>
      <button type="button" aria-pressed={sort === 'popular'} onClick={() => show('popular', genres)}>{t('인기')}</button>
    </div>
    {/* 장르 칩 — 예전 검색 페이지의 장르 버튼(2026-09-30 요청). 여러 개 고르면 그중 하나라도 맞는 이야기가 나온다. */}
    <div className={styles.genres} role="group" aria-label={t('장르 선택')}>
      {MOODS.map(genre => <button key={genre} type="button" aria-pressed={genres.includes(genre)} onClick={() => toggleGenre(genre)}>{t(genre)}</button>)}
    </div>

    <section aria-labelledby="recommend-title" className={empty || waiting ? styles.fill : undefined}>
      <div className={styles.sectionHeading}><h2 id="recommend-title">{sort === 'popular' ? t('인기 이야기') : t('전체 이야기')}</h2></div>
      <div className={styles.grid}>{recommendations.map(c => <StoryCard key={c.id} c={c} />)}</div>
      {waiting
        ? <div role="status" className={`empty-state empty-state--fill ${styles.loadingDots}`}><i aria-hidden /><i aria-hidden /><i aria-hidden /><span className="sr-only">{t('불러오는 중')}</span></div>
        : busy && <p role="status">{t('불러오는 중')}</p>}
      {error && <p role="alert">{t('목록을 불러오지 못했어요.')} <Button type="button" size="sm" variant="ghost" onClick={() => load(sort, genres, list?.nextCursor ?? null)}>{t('다시 시도')}</Button></p>}
      {empty && <p className="empty-state empty-state--fill">{genres.length ? t('고른 장르의 이야기가 아직 없어요') : sort === 'popular' ? t('아직 인기 이야기가 없어요') : t('아직 이야기가 없어요')}</p>}
      {sort === 'all' && list?.nextCursor && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-5)' }}><Button type="button" variant="secondary" onClick={() => load(sort, genres, list.nextCursor)} disabled={busy}>{busy ? t('불러오는 중') : t('더 보기')}</Button></div>}
    </section>

  </div>
}
