import { MOODS } from './genres'

export const searchQuery = (value: string) => value.trim().slice(0, 40)
export const searchNeedle = (value: string) => searchQuery(value).replace(/\s+/g, '').toLowerCase()

export function searchGenres(values: string[]): string[] | null {
  if (values.length > 20) return null
  const unique = new Map<string, string>()
  for (const raw of values) {
    const value = raw.trim()
    if (!value || value.length > 20 || value.includes('·')) return null
    const needle = searchNeedle(value)
    if (!unique.has(needle)) unique.set(needle, MOODS.find(mood => searchNeedle(mood) === needle) ?? needle)
    if (unique.size > 5) return null
  }
  return [...unique.values()].sort((left, right) => searchNeedle(left) < searchNeedle(right) ? -1 : searchNeedle(left) > searchNeedle(right) ? 1 : 0)
}

export function searchUrl(base: string, query: string, tag: string | null, genres: string[]) {
  const normalizedGenres = searchGenres(genres)
  if (!normalizedGenres) throw new Error('INVALID_GENRE')
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (tag !== null) params.set('tag', tag)
  for (const genre of normalizedGenres) params.append('genre', genre)
  return `${base}${params.size ? `?${params}` : ''}`
}
