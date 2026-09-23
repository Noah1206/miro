import { searchGenres, searchNeedle } from '@/lib/search-params'

export const SEARCH_RESTORE_KEY = 'miro-search-return'

export const searchRestoreKey = (viewerId: string | null, query: string, tag: string | null, genres: string[]) =>
  JSON.stringify([viewerId, query, tag, searchGenres(genres)?.map(searchNeedle)])

export type SearchRestore = { key: string; pages: number; scrollY: number; savedAt: number }

export function parseSearchRestore(raw: string | null, now = Date.now()): SearchRestore | null {
  try {
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || !('key' in value) || !('pages' in value) || !('scrollY' in value) || !('savedAt' in value)) return null
    const { key, pages, scrollY, savedAt } = value
    if (typeof key !== 'string' || typeof pages !== 'number' || !Number.isInteger(pages) || pages < 1 || pages > 100
      || typeof scrollY !== 'number' || !Number.isFinite(scrollY) || scrollY < 0
      || typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt > now || now - savedAt > 5 * 60_000) return null
    return { key, pages, scrollY, savedAt }
  } catch { return null }
}

export function readSearchRestore(): SearchRestore | null {
  try {
    const raw = sessionStorage.getItem(SEARCH_RESTORE_KEY)
    const saved = parseSearchRestore(raw)
    if (raw && !saved) sessionStorage.removeItem(SEARCH_RESTORE_KEY)
    return saved
  } catch { return null }
}
