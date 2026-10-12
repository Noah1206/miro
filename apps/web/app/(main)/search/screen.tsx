'use client'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, TransitionLink } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { MOODS, RELATIONS } from '@/lib/genres'
import type { CardPage } from '@/lib/home'
import { StoryCard } from '../home/feed'
import cards from '../home/home.module.css'
import styles from './search.module.css'

// Editorial defaults, not popularity rankings. Preserve all existing filters under disclosure.
const PRIMARY_GENRES = ['로맨스', '일상', '판타지', '드라마', '미스터리', '느와르']
const PRIMARY_RELATIONS = ['친구', '연인', '짝사랑', '썸', '동료', '라이벌']

export function SearchScreen() {
  const t = useT()
  const params = useSearchParams()
  const query = (params.get('q') ?? '').slice(0, 40)
  const genres = params.getAll('genre').filter(v => (MOODS as readonly string[]).includes(v))
  const relations = params.getAll('relation').filter(v => (RELATIONS as readonly string[]).includes(v))
  const canonical = new URLSearchParams()
  if (query) canonical.set('q', query)
  genres.forEach(v => canonical.append('genre', v))
  relations.forEach(v => canonical.append('relation', v))
  const key = canonical.toString()
  const [expanded, setExpanded] = useState({ genre: false, relation: false })
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
    setDraft(value); remember(value)
    const next = new URLSearchParams(key)
    if (value.trim()) next.set('q', value.trim()); else next.delete('q')
    update(next)
  }
  const [composing, setComposing] = useState(false)
  const [result, setResult] = useState<{ key: string; page: CardPage } | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const request = useRef<AbortController | null>(null)
  const page = result?.key === key ? result.page : null
  const active = !!query || genres.length + relations.length > 0
  function update(next: URLSearchParams) {
    window.history.replaceState(null, '', `/search${next.size ? `?${next}` : ''}`)
  }
  useEffect(() => { setDraft(query) }, [query])
  useEffect(() => {
    if (composing || draft.trim() === query) return
    const timer = setTimeout(() => {
      const next = new URLSearchParams(key)
      if (draft.trim()) next.set('q', draft.trim()); else next.delete('q')
      update(next)
    }, 250)
    return () => clearTimeout(timer)
  }, [draft, query, key, composing])

  async function load(cursor: string | null = null) {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setFailed(false)
    try {
      const next = new URLSearchParams(key)
      if (cursor) next.set('cursor', cursor)
      const response = await fetch(`/api/home/cards?${next}`, { signal: controller.signal, cache: 'no-store' })
      if (!response.ok) throw new Error('LOAD_FAILED')
      const incoming: CardPage = await response.json()
      if (controller.signal.aborted) return
      setResult(previous => ({ key, page: cursor && previous?.key === key
        ? { items: [...new Map([...previous.page.items, ...incoming.items].map(c => [c.id, c])).values()], nextCursor: incoming.nextCursor }
        : incoming }))
    } catch { if (!controller.signal.aborted) setFailed(true) }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  useEffect(() => {
    if (!active) {
      request.current?.abort()
      setResult(null); setBusy(false); setFailed(false)
      return
    }
    void load()
    return () => request.current?.abort()
  }, [key, retry, active]) // Empty search shows only discovery controls; each query owns its request.
  function toggle(kind: 'genre' | 'relation', value: string) {
    const next = new URLSearchParams(key)
    const selected = next.getAll(kind)
    next.delete(kind)
    const options = kind === 'genre' ? MOODS : RELATIONS
    options.filter(v => v === value ? !selected.includes(v) : selected.includes(v)).forEach(v => next.append(kind, v))
    update(next)
  }
  return <div className={styles.screen}>
    <header className={styles.header}>
      <TransitionLink href="/home" direction="back" aria-label={t('홈')} className={styles.back}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg></TransitionLink>
      <form role="search" className={styles.field} onSubmit={e => { e.preventDefault(); if (!composing) search(draft) }}>
        <input autoFocus type="search" maxLength={40} aria-label={t('검색')} placeholder={t('이름이나 키워드로 검색')} value={draft} onBlur={() => { if (!composing) remember(draft) }} onChange={e => setDraft(e.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} />
        {draft && <button type="button" aria-label={t('검색어 지우기')} onClick={() => { setDraft(''); const next = new URLSearchParams(key); next.delete('q'); update(next) }}>×</button>}
      </form>
    </header>
    <h1 className="sr-only">{t('검색')}</h1>
    <section className={styles.recent} aria-labelledby="recent-searches">
      <div className={styles.recentHeading}><h2 id="recent-searches">{t('최근 검색어')}</h2>{recent.length > 0 && <button type="button" onClick={() => saveRecent([])}>{t('전체 삭제')}</button>}</div>
      {recent.length ? <ul className={styles.recentList}>{recent.map(word => <li key={word}>
        <button type="button" onClick={() => search(word)}><span>{word}</span></button>
        <button type="button" aria-label={t('{word} 삭제', { word })} onClick={() => saveRecent(recentRef.current.filter(v => v !== word))}>×</button>
      </li>)}</ul> : <p className={styles.noRecent}>{t('최근 검색어가 없어요')}</p>}
    </section>
    <div className={styles.filters}>
      {([{ kind: 'genre', title: '장르', options: MOODS, primary: PRIMARY_GENRES, selected: genres }, { kind: 'relation', title: '관계', options: RELATIONS, primary: PRIMARY_RELATIONS, selected: relations }] as const).map(group => <section key={group.kind} className={styles.filterRow} aria-labelledby={`filter-${group.kind}`}>
        <div className={styles.groupHeading}>
          <h2 id={`filter-${group.kind}`}>{t(group.title)}</h2>
          <button type="button" className={styles.disclosure} aria-expanded={expanded[group.kind]} aria-controls={`options-${group.kind}`} aria-label={t(expanded[group.kind] ? '{name} 접기' : '{name} 더 보기', { name: t(group.title) })} onClick={() => setExpanded(previous => ({ ...previous, [group.kind]: !previous[group.kind] }))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
        </div>
        <div className={styles.chips} id={`options-${group.kind}`}>
          {[...group.primary, ...group.options.filter(value => !group.primary.includes(value) && (expanded[group.kind] || group.selected.includes(value)))].map(value => <button type="button" key={value} aria-pressed={group.selected.includes(value)} onClick={() => toggle(group.kind, value)}>{t(value)}</button>)}
        </div>
      </section>)}
    </div>
    {active && <section className={styles.results} aria-labelledby="search-results" aria-busy={busy}>
      <h2 id="search-results" className="sr-only">{t('검색 결과')}</h2>{active && <div className={styles.resultHeading}><button onClick={() => { setDraft(''); update(new URLSearchParams()) }}>{t('초기화')}</button></div>}
      <div className={cards.grid}>{page?.items.map(c => <StoryCard key={c.id} c={c} />)}</div>
      {busy && <p className={styles.status} role="status">{t('불러오는 중')}</p>}
      {failed && <div className={styles.status} role="alert"><p>{t('목록을 불러오지 못했어요.')}</p><Button variant="ghost" onClick={() => page?.nextCursor ? load(page.nextCursor) : setRetry(n => n + 1)}>{t('다시 시도')}</Button></div>}
      {!busy && !failed && page?.items.length === 0 && <p className={styles.status}>{t('고른 조건에 맞는 이야기가 아직 없어요')}</p>}
      {page?.nextCursor && !failed && <div className={styles.more}><Button variant="secondary" disabled={busy} onClick={() => load(page.nextCursor)}>{t('더 보기')}</Button></div>}
    </section>}
  </div>
}
