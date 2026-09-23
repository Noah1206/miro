'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { CharacterCard } from '@/components/character-card'
import type { CardPage } from '@/lib/home'
import { searchNeedle, searchUrl } from '@/lib/search-params'
import { readSearchRestore, searchRestoreKey, SEARCH_RESTORE_KEY } from './restore'

function pageUrl(query: string, tag: string | null, genres: string[], cursor: string | null) {
  const url = searchUrl('/api/home/search/cards', query, tag, genres)
  if (!cursor) return url
  return `${url}${url.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}`
}

export function SearchGrid({ query, tag, genres, viewerId, initial, initialError }: { query: string; tag: string | null; genres: string[]; viewerId: string | null; initial: CardPage; initialError: boolean }) {
  const router = useRouter()
  const [items, setItems] = useState(initial.items)
  const [cursor, setCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError)
  const request = useRef<{ generation: number; controller: AbortController | null }>({ generation: 0, controller: null })
  const loadedPages = useRef(1)
  const restoreScroll = useRef<number | null>(null)
  const restoreKey = searchRestoreKey(viewerId, query, tag, genres)

  useEffect(() => {
    const saved = readSearchRestore()
    if (saved && saved.key === restoreKey && !initialError) {
      const generation = ++request.current.generation
      const controller = new AbortController()
      request.current.controller = controller
      const restore = async () => {
        let restoredItems = initial.items
        let nextCursor = initial.nextCursor
        let pages = 1
        setLoading(true)
        try {
          while (pages < saved.pages && nextCursor) {
            const response = await fetch(pageUrl(query, tag, genres, nextCursor), { cache: 'no-store', signal: controller.signal })
            if (!response.ok) throw new Error('LOAD_FAILED')
            const page: CardPage = await response.json()
            if (request.current.generation !== generation) return
            restoredItems = [...new Map([...restoredItems, ...page.items].map(item => [item.id, item])).values()]
            nextCursor = page.nextCursor
            pages++
          }
          if (request.current.generation !== generation) return
          loadedPages.current = pages
          restoreScroll.current = saved.scrollY
          setItems(restoredItems)
          setCursor(nextCursor)
        } catch {
          if (request.current.generation === generation && !controller.signal.aborted) setError(true)
        } finally {
          if (request.current.generation === generation) {
            request.current.controller = null
            setLoading(false)
            sessionStorage.removeItem(SEARCH_RESTORE_KEY)
          }
        }
      }
      void restore()
    } else if (saved) sessionStorage.removeItem(SEARCH_RESTORE_KEY)
    return () => { request.current.generation++; request.current.controller?.abort() }
  }, [])

  useEffect(() => {
    if (restoreScroll.current === null || loading) return
    const scrollY = restoreScroll.current
    restoreScroll.current = null
    requestAnimationFrame(() => window.scrollTo(0, scrollY))
  }, [items.length, loading])

  async function loadMore() {
    if (loading || (!cursor && !error)) return
    const generation = ++request.current.generation
    request.current.controller?.abort()
    const controller = new AbortController()
    request.current.controller = controller
    setLoading(true); setError(false)
    try {
      const response = await fetch(pageUrl(query, tag, genres, cursor), { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error('LOAD_FAILED')
      const page: CardPage = await response.json()
      if (request.current.generation !== generation) return
      setItems(current => [...new Map([...current, ...page.items].map(item => [item.id, item])).values()])
      setCursor(page.nextCursor)
      if (cursor) loadedPages.current++
    } catch {
      if (request.current.generation === generation && !controller.signal.aborted) setError(true)
    } finally {
      if (request.current.generation === generation) {
        request.current.controller = null
        setLoading(false)
      }
    }
  }

  return <>
    {!searchNeedle(query) && tag === null && genres.length === 0 && <p className="empty-state empty-state--fill">이름이나 키워드로 캐릭터를 찾아보세요.</p>}
    {tag !== null && !searchNeedle(tag.replace(/^#/, '')) && <p className="empty-state empty-state--fill">검색할 태그를 입력해 주세요.</p>}
    {(searchNeedle(query) || tag && searchNeedle(tag.replace(/^#/, '')) || genres.length > 0) && items.length === 0 && !error && !loading && <p className="empty-state empty-state--fill">검색 결과가 없어요. 검색어나 장르를 바꿔보세요.</p>}
    {items.length > 0 && <div className="grid-2" style={{ gap: 4, padding: '0 var(--gutter)' }} onClickCapture={(event) => {
      if (event.target instanceof Element && event.target.closest('a[href^="/character/"]') && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
        const saved = { key: restoreKey, pages: loadedPages.current, scrollY: window.scrollY, savedAt: Date.now() }
        sessionStorage.setItem(SEARCH_RESTORE_KEY, JSON.stringify(saved))
      }
    }}>
      {items.map(item => <div key={item.id}>
        <CharacterCard c={item} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0 8px' }}>
          {[...new Set([...(item.genre ?? '').split('·'), ...item.relationshipKeywords].map(value => value.trim()).filter(Boolean))].slice(0, 5).map(value =>
            <button key={value} type="button" onClick={() => {
              router.push(searchUrl('/home/search', query, value, genres))
            }} style={{ border: 0, background: 'none', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer' }}>#{value.replace(/\s+/g, '')}</button>)}
        </div>
      </div>)}
    </div>}
    {loading && <p role="status" style={{ padding: 'var(--space-4) var(--gutter)' }}>검색 결과를 불러오는 중…</p>}
    {error && <p role="alert" style={{ padding: 'var(--space-4) var(--gutter)' }}>{items.length ? '다음 결과를 불러오지 못했어요.' : '검색 결과를 불러오지 못했어요.'} <Button type="button" size="sm" variant="ghost" onClick={loadMore}>다시 시도</Button></p>}
    {cursor && !error && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-5)' }}><Button type="button" variant="secondary" onClick={loadMore} disabled={loading}>{loading ? '불러오는 중' : '더 보기'}</Button></div>}
  </>
}
