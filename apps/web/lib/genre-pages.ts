import { homeCatalog, type HomeCard } from '@/lib/home'
import { DISCOVERY_GROUPS } from '@/lib/discovery-filters'

/**
 * 11/13 검색 노출용 장르 페이지(/genre/[tag]) — 사용자 결정: 성인 표시 없는 장르만.
 * 언베일 표지·성인 전용 작품은 목록에서 뺀다(세이프서치).
 */
const ADULT_MOODS = new Set(['하렘', '고수위'])
export const GENRES = (DISCOVERY_GROUPS.find(g => g.id === 'mood')!.tags as readonly string[]).filter(t => !ADULT_MOODS.has(t))

export async function genreCards(genre: string): Promise<HomeCard[]> {
  const { items } = await homeCatalog(null, { tags: [`mood:${genre}`] })
  return items.filter(c => !c.adultOnly && !c.coverUnveil).sort((a, b) => b.plays - a.plays)
}
