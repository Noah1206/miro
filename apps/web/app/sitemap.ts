import type { MetadataRoute } from 'next'
import { legalDocs } from '@/lib/legal'

const BASE = 'https://miroapp.app'
/** 11/10 공개 화면만(robots.ts 와 같은 범위). */
export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/home', '/login', '/terms', ...Object.keys(legalDocs()).map(k => `/terms/${k}`)].map(path => ({ url: `${BASE}${path}` }))
}
