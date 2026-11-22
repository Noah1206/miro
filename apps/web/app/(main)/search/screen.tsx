'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Back, Button } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { MOODS, RELATIONS } from '@/lib/genres'
import { discoveryOptionCounts, discoveryTagLabel, discoveryTags, type DiscoveryCard, type DiscoveryGroup } from '@/lib/discovery-filters'
import { DiscoveryFilters } from '@/components/discovery-filters'
import type { CardPage } from '@/lib/home'
import { CharacterCard } from '@/components/character-card'
import { startNavigation } from '@/lib/motion/view-transition'
import cards from '../home/home.module.css'
import styles from './search.module.css'
import { msg } from '@/lib/i18n'

/** 11/21 사용자: 검색 화면의 추천 검색어 — 많이 찾는 분위기 태그 5개. */
const SUGGESTED = [msg('현대물'), msg('하렘'), msg('순애'), msg('판타지'), msg('로맨스')]

export function SearchScreen({ groups = [], filterCatalog, initialPage, initialKey = '', isResults = false, resultsPath = '/search/results' }: {
  groups?: DiscoveryGroup[]; filterCatalog?: DiscoveryCard[]; isResults?: boolean; resultsPath?: '/search/results' | '/explore'
  /** 필터·검색어 없는 첫 목록(서버가 섞어 넘긴다, 10/27) — 있으면 화면이 같은 목록을 다시 받지 않는다. */
  initialPage?: CardPage
  /** 첫 목록이 어떤 정렬·필터의 목록인지(탐색 = 'sort=ranking'). */
  initialKey?: string
}) {
  const t = useT()
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const params = useSearchParams()
  const query = (params.get('q') ?? '').slice(0, 40)
  const genres = params.getAll('genre').filter(v => (MOODS as readonly string[]).includes(v))
  const relations = params.getAll('relation').filter(v => (RELATIONS as readonly string[]).includes(v))
  const tags = discoveryTags(params.getAll('tag')) ?? []
  const canonical = new URLSearchParams()
  if (query) canonical.set('q', query)
  genres.forEach(v => canonical.append('genre', v))
  relations.forEach(v => canonical.append('relation', v))
  tags.forEach(tag => canonical.append('tag', tag))
  // 11/20 사용자: 태그 위 All / Rank — Rank 는 대화량 순(서버 sort=ranking).
  // 11/22 사용자: 탐색 탭은 처음부터 Rank — 주소에 정렬이 없으면 Rank, All 을 누르면 sort=all 로 남긴다.
  const rankDefault = resultsPath === '/explore'
  const sortParam = params.get('sort')
  // 11/23 사용자: 결과 위 '초기화' 자리에 채팅순(=Rank, 대화량)/최신순 드롭다운 — 최신순은 sort=latest 로 남겨 섞지 않는다.
  const latest = sortParam === 'latest'
  const rank = !latest && (sortParam ? sortParam === 'ranking' : rankDefault)
  if (latest) canonical.set('sort', 'latest')
  else if (rank) canonical.set('sort', 'ranking')
  else if (rankDefault) canonical.set('sort', 'all')
  const key = canonical.toString()
  const optionCounts = useMemo(() => filterCatalog && !genres.length && !relations.length ? discoveryOptionCounts(filterCatalog, groups, tags, query) : undefined, [filterCatalog, groups, key])
  const [draft, setDraft] = useState(query)
  const [recent, setRecent] = useState<string[]>([])
  const recentRef = useRef<string[]>([])
  const historyKey = 'miro:recent-searches:v1'
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(historyKey) ?? '[]')
      if (Array.isArray(saved)) {
        const clean = [...new Set(saved.filter((v): v is string => typeof v === 'string' && !!v.trim()).map(v => v.trim().slice(0, 40)))].slice(0, 5)
        recentRef.current = clean; setRecent(clean)
      }
    } catch { /* Search remains usable when storage is unavailable. */ }
  }, [])
  function saveRecent(values: string[]) {
    recentRef.current = values; setRecent(values)
    try { localStorage.setItem(historyKey, JSON.stringify(values)) } catch { /* Session-only history. */ }
  }
  function remember(value: string) {
    const word = value.trim().slice(0, 40)
    if (word) saveRecent([word, ...recentRef.current.filter(v => v.toLowerCase() !== word.toLowerCase())].slice(0, 5))
  }
  function search(value: string) {
    const word = value.trim().slice(0, 40)
    if (!word && !isResults) return
    setDraft(word); remember(word)
    const next = new URLSearchParams(isResults ? key : '')
    if (word) next.set('q', word); else next.delete('q')
    if (isResults) update(next)
    // 이동 신호를 함께 보낸다 — 결과 화면이 그려지는 동안 뼈대가 뜬다(10/27).
    else { const url = `/search/results${next.size ? `?${next}` : ''}`; startNavigation('forward', () => router.push(url), url) }
  }
  const [composing, setComposing] = useState(false)
  // 11/20 사용자: 홈 검색 아이콘으로 오면 입력칸에 바로 커서(검색 화면만 — 탐색·결과 화면은 아님). 화면 전환 뒤에도 잡히게 그린 다음 한 번 더.
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!isResults) requestAnimationFrame(() => inputRef.current?.focus()) }, [isResults])
  const [result, setResult] = useState<{ key: string; page: CardPage } | null>(() => initialPage ? { key: initialKey, page: initialPage } : null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const request = useRef<AbortController | null>(null)
  const page = result?.key === key ? result.page : null
  function update(next: URLSearchParams) {
    window.history.replaceState(null, '', `${resultsPath}${next.size ? `?${next}` : ''}`)
  }
  useEffect(() => { setDraft(query) }, [query])

  async function load() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setFailed(false)
    try {
      const next = new URLSearchParams(key)
      if (next.get('sort') === 'all') next.delete('sort')   // 'all' 은 화면 표시용 — 서버엔 정렬 없이(기본)
      const response = await fetch(`/api/home/cards?${next}`, { signal: controller.signal, cache: 'no-store' })
      if (!response.ok) throw new Error('LOAD_FAILED')
      const incoming: CardPage = await response.json()
      if (controller.signal.aborted) return
      if (!next.size) {
        // Shuffle the complete visible catalog once per load, keeping its order stable while browsing.
        for (let index = incoming.items.length - 1; index > 0; index--) {
          const other = Math.floor(Math.random() * (index + 1))
          ;[incoming.items[index], incoming.items[other]] = [incoming.items[other]!, incoming.items[index]!]
        }
      }
      setResult({ key, page: incoming })
    } catch { if (!controller.signal.aborted) setFailed(true) }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  useEffect(() => {
    if (!isResults) {
      request.current?.abort()
      setResult(null); setBusy(false); setFailed(false)
      return
    }
    // 필터·검색어가 없으면 서버가 넘긴 첫 목록을 쓴다 — 같은 목록을 다시 받지 않는다(10/27). '다시 시도'는 예전처럼 받는다.
    if (!key && !retry && initialPage) {
      request.current?.abort()
      setResult({ key: '', page: initialPage }); setBusy(false); setFailed(false)
      return
    }
    void load()
    return () => request.current?.abort()
  }, [key, retry, isResults]) // Only the results route fetches catalog data; each query owns its request.
  const field = <form role="search" className={styles.field} onSubmit={e => { e.preventDefault(); if (!composing) search(draft) }}>
    <input ref={inputRef} autoFocus={!isResults} type="search" enterKeyHint="search" maxLength={40} aria-label={t('검색')} placeholder={t('이름이나 키워드로 검색')} value={draft} onChange={e => setDraft(e.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} />
    {draft && <button type="button" aria-label={t('검색어 지우기')} onClick={() => setDraft('')}>×</button>}
    <button type="submit" aria-label={t('검색')} className={styles.searchIcon}><svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg></button>
  </form>
  return <div className={`${styles.screen} ${isResults ? styles.resultsScreen : ''}`}>
    {/* 11/20 사용자: 탐색·검색은 하단 탭 없이 위쪽 화살표로 돌아간다. */}
    {/* 11/20 사용자: 탐색·결과 화면도 < 옆에 검색창 — 누르면 지금 필터에 검색어를 더한다. */}
    {isResults && <div className={`${styles.backRow} ${styles.backSearch}`}><Back href={resultsPath === '/explore' ? '/home' : '/search'} />{field}</div>}
    {/* 11/20 사용자: 검색 화면도 < 와 검색창을 한 줄로(탐색 화면과 같은 모양). */}
    {!isResults && <header className={`sticky-head ${styles.header}`}>
      <div className={`${styles.backRow} ${styles.backSearch}`}><Back href="/home" />{field}</div>
    </header>}
    <h1 className="sr-only">{t(resultsPath === '/explore' ? '탐색' : isResults ? '검색 결과' : '검색')}</h1>
    {isResults && <section className={styles.filters} aria-labelledby="search-filters">
      <h2 id="search-filters" className="sr-only">{t('검색 필터')}</h2>
      <div className={styles.sortTabs} role="tablist" aria-label={t('정렬')}>
        <button type="button" role="tab" aria-selected={!rank && !latest} onClick={() => { const next = new URLSearchParams(key); if (rankDefault) next.set('sort', 'all'); else next.delete('sort'); update(next) }}>All</button>
        <span aria-hidden>/</span>
        <button type="button" role="tab" aria-selected={rank} onClick={() => { const next = new URLSearchParams(key); next.set('sort', 'ranking'); update(next) }}>Rank</button>
      </div>
      <DiscoveryFilters appearance="search" groups={groups} selected={tags} counts={optionCounts} onChange={values => { const next = new URLSearchParams(key); next.delete('tag'); values.forEach(value => next.append('tag', value)); update(next) }} />
    </section>}
    <AnimatePresence initial={false}>
      {isResults && (query || tags.length > 0) && <motion.div key="conditions" className={`${styles.chips} ${styles.queryChips}`} role="group" aria-label={t('검색 조건')}
        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0, marginTop: 0 }} transition={{ duration: reducedMotion ? 0 : .16 }}>
        <AnimatePresence initial={false} mode="popLayout">
          {tags.map(tag => <motion.button layout type="button" key={`tag:${tag}`} initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .75 }} transition={{ duration: reducedMotion ? 0 : .16 }} aria-label={t('{word} 삭제', { word: discoveryTagLabel(tag) })} onClick={() => { const next = new URLSearchParams(key); next.delete('tag'); tags.filter(value => value !== tag).forEach(value => next.append('tag', value)); update(next) }}><span>#{t(discoveryTagLabel(tag)).replace(/\s+/g, '')}</span><span aria-hidden="true">×</span></motion.button>)}
          {query && <motion.button layout type="button" key={`query:${query}`} initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .75 }} transition={{ duration: reducedMotion ? 0 : .16 }} aria-label={t('검색어 삭제')} onClick={() => { const next = new URLSearchParams(key); next.delete('q'); update(next) }}><span>#{query.replace(/\s+/g, '')}</span><span aria-hidden="true">×</span></motion.button>}
        </AnimatePresence>
      </motion.div>}
    </AnimatePresence>
    {/* 11/21 사용자: 최근 검색어 제목은 비어 있어도 크게 보이고, 그 아래 추천 검색어 5개를 세로 한 줄씩. */}
    {!isResults && <section className={styles.recent} aria-labelledby="recent-searches">
      <div className={styles.recentHeading}><h2 id="recent-searches">{t('최근 검색어')}</h2>{recent.length > 0 && <button type="button" onClick={() => saveRecent([])}>{t('전체 삭제')}</button>}</div>
      {recent.length === 0 ? <p className={styles.recentEmpty}>{t('최근 검색어가 없어요')}</p>
        : <ul className={styles.recentList}>{recent.map(word => <li key={word}>
        <button type="button" onClick={() => search(word)}><span>{word}</span></button>
        <button type="button" aria-label={t('{word} 삭제', { word })} onClick={() => saveRecent(recentRef.current.filter(v => v !== word))}>×</button>
      </li>)}</ul>}
    </section>}
    {!isResults && <section className={styles.recent} aria-labelledby="suggested-searches">
      <div className={styles.recentHeading}><h2 id="suggested-searches">{t('추천 검색어')}</h2></div>
      <ul className={styles.recentList}>{SUGGESTED.map((word, index) => <li key={word}>
        <button type="button" className={styles.suggested} onClick={() => search(t(word))}><i aria-hidden className={styles.rankNum}>{index + 1}</i><span>{t(word)}</span></button>
      </li>)}</ul>
    </section>}
    {isResults && <section className={styles.results} aria-label={t('검색 결과')} aria-busy={busy}>
      <div className={styles.resultHeading}><span role="status" className={styles.resultCount}>{busy || !page ? t('결과 확인 중') : t('결과 {count}개', { count: page.items.length })}</span><SortMenu value={latest ? 'latest' : rank ? 'ranking' : ''} onChange={value => { const next = new URLSearchParams(key); next.set('sort', value); update(next) }} /></div>
      {/* 11/7 사용자: 탐색 카드도 홈 줄 카드와 같은 내용(제목·두 줄 소개·해시태그 칩)으로. */}
      <div className={cards.grid}>{page?.items.map(c => <CharacterCard key={c.id} c={{ ...c, caption: c.role }} />)}</div>
      {busy && <p className={styles.status} role="status">{t('불러오는 중')}</p>}
      {failed && <div className={styles.status} role="alert"><p>{t('목록을 불러오지 못했어요.')}</p><Button variant="ghost" onClick={() => setRetry(n => n + 1)}>{t('다시 시도')}</Button></div>}
      {!busy && !failed && page?.items.length === 0 && <p className={styles.status}>{t('고른 조건에 맞는 이야기가 아직 없어요')}</p>}
    </section>}
  </div>
}

/** 11/23 채팅순/최신순 — 아이폰은 select 글자를 16px 로 키워(globals.css) 직접 만든 작은 메뉴로. */
function SortMenu({ value, onChange }: { value: string; onChange: (value: 'ranking' | 'latest') => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('pointerdown', away); addEventListener('keydown', esc)
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', esc) }
  }, [open])
  const options = [['ranking', '채팅순'], ['latest', '최신순']] as const
  const label = options.find(([v]) => v === value)?.[1] ?? '정렬'
  return <div ref={box} className={styles.sortMenu}>
    <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${t('정렬')}: ${t(label)}`} onClick={() => setOpen(v => !v)}>
      {t(label)}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && <ul role="listbox" aria-label={t('정렬')}>
      {options.map(([v, l]) => <li key={v} role="option" aria-selected={v === value}><button type="button" onClick={() => { setOpen(false); if (v !== value) onChange(v) }}>{t(l)}</button></li>)}
    </ul>}
  </div>
}
