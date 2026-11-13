import type { MetadataRoute } from 'next'
import { legalDocs } from '@/lib/legal'
import { homeSections } from '@/lib/home'
import { GENRES, genreCards } from '@/lib/genre-pages'

const BASE = 'https://miroapp.app'
/** 공개 화면만(robots.ts 와 같은 범위). 11/13 베이비챗식: 홈 + 인기 캐릭터 상세 100개(홈에 보이는 공개 작품, 최근 7일 대화 인원 순). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = await homeSections(null)
  const cards = [...s.originals, ...s.rising, ...s.popularMale, ...s.popularFemale, ...s.forYou, ...s.fresh, ...s.safety, ...s.others]
    .sort((a, b) => (b.recentPlays ?? 0) - (a.recentPlays ?? 0) || b.plays - a.plays).slice(0, 100)
  // 11/13 장르 페이지 — 성인 표시 없는 장르 중 목록이 비지 않은 것만(빈 페이지는 404).
  const genres = (await Promise.all(GENRES.map(async g => (await genreCards(g)).length ? g : null))).filter((g): g is string => !!g)
  // '/' 는 /home 으로 넘기는 주소라 뺀다(넘어가는 주소는 사이트맵에 두지 않는다).
  return [
    { url: `${BASE}/home`, priority: 1 },
    ...genres.map(g => ({ url: `${BASE}/genre/${encodeURIComponent(g)}`, priority: 0.9 })),
    ...cards.map(c => ({ url: `${BASE}/character/${c.slug}`, lastModified: c.createdAt, priority: 0.8 })),
    ...['/login', '/terms', ...Object.keys(legalDocs()).map(k => `/terms/${k}`)].map(path => ({ url: `${BASE}${path}` })),
  ]
}
