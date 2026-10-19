'use client'
import { characterTags } from '@/lib/character-card-copy'
import { characterTagFont } from '@/lib/character-tag-font'
import { useState } from 'react'
import { Button, TransitionLink } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import type { CardPage, HomeCard, HomeSort } from '@/lib/home'
import { HomeContentTabs } from './content-tabs'
import styles from './home.module.css'
import { useT } from '@/lib/i18n/client'

const picture = (c: HomeCard) => c.images[0] ?? null

/** 카드에 대화한 사람 수(말풍선 숫자)는 띄우지 않는다(2026-09-30 요청). */
function CardDetails({ c }: { c: HomeCard }) {
  return <span className={styles.cardDetails}>
    <strong>{c.name}</strong>
    <span className={`${styles.cardTags} ${characterTagFont.className}`}>{characterTags(c).map(tag => <span key={tag}>#{tag}</span>)}</span>
  </span>
}
export function StoryCard({ c }: { c: HomeCard }) {
  const t = useT()
  return <TransitionLink className={styles.story} href={`/character/${c.slug || c.id}`} aria-label={`${c.name}, ${c.role || t('이야기 살펴보기')}`}>
    <div className={styles.poster}>
      <CharacterVisual name={c.name} accent={c.accentA} slug={c.slug || c.id} photo={picture(c)} ratio="4 / 5" shared={false} scrim={false} style={{ borderRadius: 0 }} />
    </div>
    <CardDetails c={c} />
  </TransitionLink>
}

/** 정렬·조건별로 전체 목록을 보관해, 정렬을 바꿔도 다른 목록이 섞이지 않는다. */
type Filter = { genres: string[]; relations: string[]; sort: HomeSort }
const NONE: Filter = { genres: [], relations: [], sort: 'latest' }
const listKey = (filter: Filter) => JSON.stringify([filter.genres, filter.relations, filter.sort])
/** genres = 탐색 탭 주소의 장르(홈 장르 줄의 '전체 보기', 10/19). initial 은 그 조건으로 읽은 목록이다. */
export function HomeFeed({ initial, genres = [] }: { initial: CardPage; genres?: string[] }) {
  const start: Filter = { ...NONE, genres }
  const [filter, setFilter] = useState<Filter>(start)
  const [lists, setLists] = useState<Record<string, CardPage>>(() => ({ [listKey(start)]: initial }))
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const t = useT()
  const key = listKey(filter)
  const list = lists[key]
  const recommendations = list?.items ?? []
  const busy = !!loading[key]
  const error = !!failed[key]
  const empty = !!list && recommendations.length === 0 && !busy && !error
  /** 처음 여는 목록(장르·관계)은 빈 채로 기다린다 — 글 대신 가운데에서 튕기는 점 세 개(2026-09-30 요청). */
  const waiting = !list && busy

  async function load(next: Filter) {
    const k = listKey(next)
    if (loading[k]) return
    setLoading(current => ({ ...current, [k]: true })); setFailed(current => ({ ...current, [k]: false }))
    try {
      const params = new URLSearchParams()
      params.set('sort', next.sort)
      for (const genre of next.genres) params.append('genre', genre)
      for (const relation of next.relations) params.append('relation', relation)
      const response = await fetch(`/api/home/cards?${params}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('LOAD_FAILED')
      const page: CardPage = await response.json()
      setLists(current => ({ ...current, [k]: page }))
    } catch { setFailed(current => ({ ...current, [k]: true })) } finally { setLoading(current => ({ ...current, [k]: false })) }
  }

  return <div className={`${styles.feed} ${empty || waiting ? styles.fill : ''}`}>
    <HomeContentTabs active={filter.sort} onChange={sort => {
      const next = { ...filter, sort }
      setFilter(next)
      if (!lists[listKey(next)]) void load(next)
    }} />
    <h1 className="sr-only">{t('홈')}</h1>
    <section aria-labelledby="recommend-title" className={empty || waiting ? styles.fill : undefined}>
      {/* '전체 이야기' 제목은 화면에서 뺐다(2026-09-30 요청) — 화면 읽기용으로만 남긴다. */}
      <h2 id="recommend-title" className="sr-only">{t('전체 이야기')}</h2>
      <div className={styles.grid}>{recommendations.map(c => <StoryCard key={c.id} c={c} />)}</div>
      {waiting
        ? <div role="status" className={`empty-state empty-state--fill ${styles.loadingDots}`}><i aria-hidden /><i aria-hidden /><i aria-hidden /><span className="sr-only">{t('불러오는 중')}</span></div>
        : busy && <p role="status">{t('불러오는 중')}</p>}
      {error && <p role="alert">{t('목록을 불러오지 못했어요.')} <Button type="button" size="sm" variant="ghost" onClick={() => load(filter)}>{t('다시 시도')}</Button></p>}
      {empty && <p className="empty-state empty-state--fill">{filter.genres.length || filter.relations.length ? t('고른 조건에 맞는 이야기가 아직 없어요') : t('아직 이야기가 없어요')}</p>}
    </section>

  </div>
}
