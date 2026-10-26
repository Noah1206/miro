'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { MOODS, RELATIONS } from '@/lib/genres'
import { discoveryOptionCounts, discoveryTagLabel, discoveryTags, type DiscoveryCard, type DiscoveryGroup } from '@/lib/discovery-filters'
import { DiscoveryFilters } from '@/components/discovery-filters'
import type { CardPage } from '@/lib/home'
import { StoryCard } from '../home/feed'
import cards from '../home/home.module.css'
import styles from './search.module.css'

export function SearchScreen({ groups = [], filterCatalog, isResults = false, resultsPath = '/search/results' }: { groups?: DiscoveryGroup[]; filterCatalog?: DiscoveryCard[]; isResults?: boolean; resultsPath?: '/search/results' | '/explore' }) {
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
        const clean = [...new Set(saved.filter((v): v is string => typeof v === 'string' && !!v.trim()).map(v => v.trim().slice(0, 40)))].slice(0, 8)
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
    if (word) saveRecent([word, ...recentRef.current.filter(v => v.toLowerCase() !== word.toLowerCase())].slice(0, 8))
  }
  function search(value: string) {
    const word = value.trim().slice(0, 40)
    if (!word && !isResults) return
    setDraft(word); remember(word)
    const next = new URLSearchParams(isResults ? key : '')
    if (word) next.set('q', word); else next.delete('q')
    if (isResults) update(next)
    else router.push(`/search/results${next.size ? `?${next}` : ''}`)
  }
  const [composing, setComposing] = useState(false)
  const [result, setResult] = useState<{ key: string; page: CardPage } | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const request = useRef<AbortController | null>(null)
  const page = result?.key === key ? result.page : null
  const active = !!query || genres.length + relations.length + tags.length > 0
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
      const response = await fetch(`/api/home/cards?${next}`, { signal: controller.signal, cache: 'no-store' })
      if (!response.ok) throw new Error('LOAD_FAILED')
      const incoming: CardPage = await response.json()
      if (controller.signal.aborted) return
      if (!key) {
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
    void load()
    return () => request.current?.abort()
  }, [key, retry, isResults]) // Only the results route fetches catalog data; each query owns its request.
  return <div className={`${styles.screen} ${isResults ? styles.resultsScreen : ''}`}>
    {!isResults && <header className={`sticky-head ${styles.header}`}>
      <form role="search" className={styles.field} onSubmit={e => { e.preventDefault(); if (!composing) search(draft) }}>
        <input type="search" enterKeyHint="search" maxLength={40} aria-label={t('검색')} placeholder={t('이름이나 키워드로 검색')} value={draft} onChange={e => setDraft(e.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} />
        {draft && <button type="button" aria-label={t('검색어 지우기')} onClick={() => setDraft('')}>×</button>}
      </form>
    </header>}
    <h1 className="sr-only">{t(resultsPath === '/explore' ? '탐색' : isResults ? '검색 결과' : '검색')}</h1>
    {isResults && <section className={styles.filters} aria-labelledby="search-filters">
      <h2 id="search-filters" className="sr-only">{t('검색 필터')}</h2>
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
    {!isResults && recent.length > 0 && <section className={styles.recent} aria-labelledby="recent-searches">
      <div className={styles.recentHeading}><h2 id="recent-searches">{t('최근 검색어')}</h2><button type="button" onClick={() => saveRecent([])}>{t('전체 삭제')}</button></div>
      <ul className={styles.recentList}>{recent.map(word => <li key={word}>
        <button type="button" onClick={() => search(word)}><span>{word}</span></button>
        <button type="button" aria-label={t('{word} 삭제', { word })} onClick={() => saveRecent(recentRef.current.filter(v => v !== word))}>×</button>
      </li>)}</ul>
    </section>}
    {isResults && <section className={styles.results} aria-label={t('검색 결과')} aria-busy={busy}>
      <div className={styles.resultHeading}><span role="status" className={styles.resultCount}>{busy || !page ? t('결과 확인 중') : t('결과 {count}개', { count: page.items.length })}</span><button disabled={busy || !active} onClick={() => { if (!active) return; setDraft(''); update(new URLSearchParams()) }}>{t('초기화')}</button></div>
      <div className={cards.grid}>{page?.items.map(c => <StoryCard key={c.id} c={c} />)}</div>
      {busy && <p className={styles.status} role="status">{t('불러오는 중')}</p>}
      {failed && <div className={styles.status} role="alert"><p>{t('목록을 불러오지 못했어요.')}</p><Button variant="ghost" onClick={() => setRetry(n => n + 1)}>{t('다시 시도')}</Button></div>}
      {!busy && !failed && page?.items.length === 0 && <p className={styles.status}>{t('고른 조건에 맞는 이야기가 아직 없어요')}</p>}
    </section>}
  </div>
}
