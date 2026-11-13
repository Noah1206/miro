import type { MetadataRoute } from 'next'
import { legalDocs } from '@/lib/legal'
import { homeSections } from '@/lib/home'

const BASE = 'https://miroapp.app'
/** 공개 화면만(robots.ts 와 같은 범위). 11/13 베이비챗식: 홈 + 인기 캐릭터 상세 100개(홈에 보이는 공개 작품, 최근 7일 대화 인원 순). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = await homeSections(null)
  const cards = [...s.originals, ...s.rising, ...s.popularMale, ...s.popularFemale, ...s.forYou, ...s.fresh, ...s.safety, ...s.others]
    .sort((a, b) => (b.recentPlays ?? 0) - (a.recentPlays ?? 0) || b.plays - a.plays).slice(0, 100)
  // '/' 는 /home 으로 넘기는 주소라 뺀다(넘어가는 주소는 사이트맵에 두지 않는다).
  return [
    { url: `${BASE}/home`, priority: 1 },
    ...cards.map(c => ({ url: `${BASE}/character/${c.slug}`, lastModified: c.createdAt, priority: 0.8 })),
    ...['/login', '/terms', ...Object.keys(legalDocs()).map(k => `/terms/${k}`)].map(path => ({ url: `${BASE}${path}` })),
  ]
}
