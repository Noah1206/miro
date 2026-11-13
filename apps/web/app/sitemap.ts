import type { MetadataRoute } from 'next'
import { legalDocs } from '@/lib/legal'

const BASE = 'https://miroapp.app'
/** 11/10 공개 화면만(robots.ts 와 같은 범위). */
export default function sitemap(): MetadataRoute.Sitemap {
  // '/' 는 /home 으로 넘기는 주소라 뺀다(넘어가는 주소는 사이트맵에 두지 않는다).
  return ['/home', '/login', '/terms', ...Object.keys(legalDocs()).map(k => `/terms/${k}`)].map(path => ({ url: `${BASE}${path}` }))
}
