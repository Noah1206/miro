'use client'
import { useState } from 'react'
import { Button, TransitionLink } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import { MOODS, RELATIONS } from '@/lib/genres'
import type { CardPage, HomeCard } from '@/lib/home'
import styles from './home.module.css'
import { useT } from '@/lib/i18n/client'

const unique = (items: HomeCard[]) => [...new Map(items.map(c => [c.id, c])).values()]
const picture = (c: HomeCard) => c.images[0] ?? null

/** 카드에 대화한 사람 수(말풍선 숫자)는 띄우지 않는다(2026-09-30 요청). */
function PhotoDetails({ c }: { c: HomeCard }) {
  return <span className={styles.photoDetails}>
    <strong>{c.name}</strong>
    {(c.tagline || c.role) && <span className={styles.photoTagline}>{c.tagline || c.role}</span>}
  </span>
}
function StoryCard({ c }: { c: HomeCard }) {
  const t = useT()
  // 해시태그는 카드 밑에 — 장르 → 관계 순으로 8개까지, 넘치면 다음 줄로(2026-09-30, 10/5 5→8개·회색 칩).
  const tags = [...new Set([...(c.genre ?? '').split('·').map(g => g.trim()), ...c.relationshipKeywords])].filter(Boolean).slice(0, 8)
  return <TransitionLink className={styles.story} href={`/character/${c.slug || c.id}`} aria-label={`${c.name}, ${c.role || t('이야기 살펴보기')}`}>
    <div className={styles.poster}>
      <CharacterVisual name={c.name} accent={c.accentA} slug={c.slug || c.id} photo={picture(c)} ratio="2 / 3" shared={false} scrim={false} style={{ borderRadius: 0 }} />
      <PhotoDetails c={c} />
    </div>
    {tags.length > 0 && <p className={styles.cardTags}>{tags.map(tag => <span key={tag}>#{tag.replace(/\s+/g, '')}</span>)}</p>}
  </TransitionLink>
}

/** 고른 장르·관계마다 목록을 따로 둔다 — 칩을 껐다 켜도 받은 목록은 다시 받지 않는다. */
type Filter = { genres: string[]; relations: string[] }
const NONE: Filter = { genres: [], relations: [] }
const listKey = (filter: Filter) => JSON.stringify([filter.genres, filter.relations])
// 칩 순서대로 모은다 — 같은 묶음이 누른 순서 때문에 다른 목록이 되지 않게.
const toggled = (options: readonly string[], chosen: string[], value: string) =>
  options.filter(option => option === value ? !chosen.includes(option) : chosen.includes(option))

/** 장르·관계 칩 섹션 하나(2026-09-30 요청) — 제목 아래 한 줄, 가로로 넘긴다. */
function ChipSection({ id, title, options, chosen, onToggle }: { id: string; title: string; options: readonly string[]; chosen: string[]; onToggle: (value: string) => void }) {
  const t = useT()
  return <section aria-labelledby={id} className={styles.chipSection}>
    <h2 id={id}>{title}</h2>
    <div className={styles.chips} role="group" aria-labelledby={id}>
      {options.map(value => <button key={value} type="button" aria-pressed={chosen.includes(value)} onClick={() => onToggle(value)}>{t(value)}</button>)}
    </div>
  </section>
}

export function HomeFeed({ initial }: { initial: CardPage }) {
  const [filter, setFilter] = useState<Filter>(NONE)
  const [lists, setLists] = useState<Record<string, CardPage>>(() => ({ [listKey(NONE)]: initial }))
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

  async function load(next: Filter, cursor: string | null = null) {
    const k = listKey(next)
    if (loading[k]) return
    setLoading(current => ({ ...current, [k]: true })); setFailed(current => ({ ...current, [k]: false }))
    try {
      const params = new URLSearchParams(cursor ? { cursor } : {})
      for (const genre of next.genres) params.append('genre', genre)
      for (const relation of next.relations) params.append('relation', relation)
      const response = await fetch(`/api/home/cards?${params}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('LOAD_FAILED')
      const page: CardPage = await response.json()
      setLists(current => ({ ...current, [k]: cursor && current[k] ? { items: unique([...current[k].items, ...page.items]), nextCursor: page.nextCursor } : page }))
    } catch { setFailed(current => ({ ...current, [k]: true })) } finally { setLoading(current => ({ ...current, [k]: false })) }
  }

  function show(next: Filter) {
    setFilter(next)
    if (!lists[listKey(next)]) void load(next)
  }

  return <div className={`${styles.feed} ${empty || waiting ? styles.fill : ''}`}>
    <h1 className="sr-only">{t('홈')}</h1>
    {/* 장르·관계는 각자 섹션(2026-09-30 요청, 전체·인기 버튼은 없앴다). 한 섹션 안에서는 하나라도, 두 섹션을 같이 고르면 둘 다 맞는 이야기. */}
    <ChipSection id="genre-title" title={t('장르')} options={MOODS} chosen={filter.genres}
      onToggle={value => show({ ...filter, genres: toggled(MOODS, filter.genres, value) })} />
    <ChipSection id="relation-title" title={t('관계')} options={RELATIONS} chosen={filter.relations}
      onToggle={value => show({ ...filter, relations: toggled(RELATIONS, filter.relations, value) })} />

    <section aria-labelledby="recommend-title" className={empty || waiting ? styles.fill : undefined}>
      {/* '전체 이야기' 제목은 화면에서 뺐다(2026-09-30 요청) — 화면 읽기용으로만 남긴다. */}
      <h2 id="recommend-title" className="sr-only">{t('전체 이야기')}</h2>
      <div className={styles.grid}>{recommendations.map(c => <StoryCard key={c.id} c={c} />)}</div>
      {waiting
        ? <div role="status" className={`empty-state empty-state--fill ${styles.loadingDots}`}><i aria-hidden /><i aria-hidden /><i aria-hidden /><span className="sr-only">{t('불러오는 중')}</span></div>
        : busy && <p role="status">{t('불러오는 중')}</p>}
      {error && <p role="alert">{t('목록을 불러오지 못했어요.')} <Button type="button" size="sm" variant="ghost" onClick={() => load(filter, list?.nextCursor ?? null)}>{t('다시 시도')}</Button></p>}
      {empty && <p className="empty-state empty-state--fill">{filter.genres.length || filter.relations.length ? t('고른 조건에 맞는 이야기가 아직 없어요') : t('아직 이야기가 없어요')}</p>}
      {list?.nextCursor && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-5)' }}><Button type="button" variant="secondary" onClick={() => load(filter, list.nextCursor)} disabled={busy}>{busy ? t('불러오는 중') : t('더 보기')}</Button></div>}
    </section>

  </div>
}
