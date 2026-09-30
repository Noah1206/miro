import { MOODS } from './genres'

export const searchNeedle = (value: string) => value.trim().slice(0, 40).replace(/\s+/g, '').toLowerCase()

export function searchGenres(values: string[]): string[] | null {
  if (values.length > 20) return null
  const unique = new Map<string, string>()
  for (const raw of values) {
    const value = raw.trim()
    if (!value || value.length > 20 || value.includes('·')) return null
    const needle = searchNeedle(value)
    if (!unique.has(needle)) unique.set(needle, MOODS.find(mood => searchNeedle(mood) === needle) ?? needle)
  }
  return [...unique.values()].sort((left, right) => searchNeedle(left) < searchNeedle(right) ? -1 : searchNeedle(left) > searchNeedle(right) ? 1 : 0)
}
