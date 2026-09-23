'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { MOODS } from '@/lib/genres'
import { searchGenres, searchNeedle, searchQuery, searchUrl } from '@/lib/search-params'
import { SearchResultsSkeleton } from '@/components/page-skeletons'
import styles from './search.module.css'
import { readSearchRestore, searchRestoreKey } from './restore'

/**
 * 검색 머리 — 검색창을 바로 보여주고 입력에 초점을 맞춘다.
 * `base` 는 검색 결과가 열리는 경로다 — 일반 캐릭터 검색은 /home/search.
 */
export function SearchHeader({ q, tag, genres, viewerId, base, children }: { q: string; tag: string | null; genres: string[]; viewerId: string | null; base: string; children: React.ReactNode }) {
  const router = useRouter()
  const [value, setValue] = useState(q)
  const [pending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const committed = useRef(q)
  const historyChange = useRef(false)
  const genreKey = genres.join('\0')

  useEffect(() => {
    if (readSearchRestore()?.key !== searchRestoreKey(viewerId, q, tag, genres)) input.current?.focus()
  }, [])
  useEffect(() => {
    const onHistoryChange = () => { historyChange.current = true }
    window.addEventListener('popstate', onHistoryChange)
    return () => window.removeEventListener('popstate', onHistoryChange)
  }, [])
  useEffect(() => {
    setValue(current => historyChange.current || current === committed.current ? q : current)
    committed.current = q
    historyChange.current = false
  }, [q, tag, genreKey])

  const submit = () => {
    if (composing.current) return
    const next = searchQuery(value)
    if (!searchNeedle(next) || searchNeedle(next) === searchNeedle(q)) return
    startTransition(() => router.push(searchUrl(base, next, tag, genres)))
  }
  const submitTag = () => {
    const nextTag = searchQuery(value.slice(1))
    setValue('')
    startTransition(() => router.push(searchUrl(base, '', nextTag, genres)))
  }
  const toggleGenre = (genre: string) => {
    const selected = genres.some(value => searchNeedle(value) === searchNeedle(genre))
    const next = searchGenres(selected ? genres.filter(value => searchNeedle(value) !== searchNeedle(genre)) : [...genres, genre])
    if (next) startTransition(() => router.push(searchUrl(base, q, tag, next)))
  }
  const canSubmit = !!searchNeedle(value) && searchNeedle(value) !== searchNeedle(q)
  const options = [...MOODS, ...genres.filter(genre => !MOODS.some(mood => searchNeedle(mood) === searchNeedle(genre)))]

  return <>
    <header className={pending ? styles.pending : undefined} style={{ padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--gutter) var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {children}
      </div>

      <form role="search" onSubmit={(e) => { e.preventDefault(); submit() }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'var(--space-4)', padding: '0 12px', minHeight: 42, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)' }}>
        <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
        </svg>
        <input ref={input} className={styles.query} type="search" name="q" value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} enterKeyHint="search"
          placeholder="이름, 장르, 키워드" aria-label="캐릭터 검색" autoComplete="off"
          onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.nativeEvent.isComposing || composing.current || e.nativeEvent.keyCode === 229)) e.preventDefault()
          }}
          style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 14 }} />
        {value && (
          <button type="button" onClick={() => { setValue(''); input.current?.focus(); if (q) startTransition(() => router.replace(searchUrl(base, '', tag, genres))) }} aria-label="검색어 지우기" className="hit"
            style={{ background: 'none', border: 0, padding: 2, color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0 }}>
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
        <button type="submit" aria-label="검색 실행" disabled={!canSubmit || pending}
          style={{ background: 'none', border: 0, padding: 4, color: 'var(--color-text-primary)', cursor: 'pointer', flexShrink: 0, opacity: canSubmit ? 1 : 0.4 }}>
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        </button>
      </form>
      {value.startsWith('#') && <button type="button" onClick={submitTag} disabled={pending} style={{ marginTop: 8, border: 0, background: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>태그로 검색</button>}
      {tag !== null && <button type="button" onClick={() => startTransition(() => router.replace(searchUrl(base, q, null, genres)))}
        aria-label="태그 필터 지우기" style={{ marginTop: 8, border: 0, borderRadius: 12, padding: '5px 8px', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', cursor: 'pointer' }}>#{tag || '태그 없음'} ×</button>}
      <div role="group" aria-label="장르 선택" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>장르 · 최대 5개</span>
          {genres.length > 0 && <button type="button" onClick={() => startTransition(() => router.push(searchUrl(base, q, tag, [])))} disabled={pending}
            style={{ border: 0, background: 'none', color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer' }}>장르 전체 해제</button>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {options.map(genre => {
            const selected = genres.some(value => searchNeedle(value) === searchNeedle(genre))
            return <button key={genre} type="button" aria-pressed={selected} onClick={() => toggleGenre(genre)} disabled={pending || (!selected && genres.length >= 5)}
              style={{ padding: '6px 10px', borderRadius: 16, border: 0, background: selected ? 'var(--color-surface-3)' : 'var(--color-surface-2)', color: 'var(--color-text-primary)', cursor: 'pointer' }}>{genre}</button>
          })}
        </div>
      </div>
    </header>
    {pending && <SearchResultsSkeleton />}
  </>
}
