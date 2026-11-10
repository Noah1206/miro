import type { MetadataRoute } from 'next'

/** 11/10 검색 노출 — 홈·로그인·약관만, 대화·내 정보·만들기·API·관리는 막는다. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: ['/', '/home', '/login', '/terms'], disallow: ['/chat', '/my', '/api', '/admin', '/create', '/messages', '/onboarding', '/character', '/search', '/explore', '/stories', '/archive', '/persona', '/recharge', '/report', '/miro', '/auth', '/deleted', '/alpha', '/dev', '/mock-media'] },
    sitemap: 'https://miroapp.app/sitemap.xml',
  }
}
