import type { MetadataRoute } from 'next'

// 11/13 AEO: AI 검색·답변용 봇(OAI-SearchBot·ChatGPT-User·Claude-SearchBot·Claude-User·PerplexityBot·Perplexity-User)은 막지 않는다 —
// 학습용이 아니라 ChatGPT·Claude·Perplexity 답변에 미로를 띄우는 봇이다. 아래는 학습·수집용만. Cloudflare AI Crawl Control 에서도 검색 봇은 허용해야 효과가 있다.
const AI_BOTS = ['GPTBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'Google-Extended', 'GoogleOther',
  'CCBot', 'Bytespider', 'Amazonbot', 'Applebot-Extended', 'meta-externalagent', 'FacebookBot', 'cohere-ai', 'Diffbot', 'YouBot', 'Timpibot', 'ImagesiftBot', 'omgili']

/** 11/10 검색 노출 — 홈·로그인·약관, 11/13 캐릭터 상세 추가(베이비챗식). 대화·내 정보·만들기·API·관리는 막는다. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // 11/12 사용자: AI 학습·분석용 수집 봇은 사이트 전체를 막는다(검색엔진은 아래 규칙 그대로). robots.txt 는 지키는 봇에만 효과 — 실제 차단은 Cloudflare AI Crawl Control.
      { userAgent: AI_BOTS, disallow: '/' },
      { userAgent: '*', allow: ['/', '/home', '/login', '/terms', '/character'], disallow: ['/chat', '/my', '/api', '/admin', '/create', '/messages', '/onboarding', '/character/*/comments', '/search', '/explore', '/stories', '/archive', '/persona', '/recharge', '/report', '/miro', '/auth', '/deleted', '/alpha', '/dev', '/mock-media'] },
    ],
    sitemap: 'https://miroapp.app/sitemap.xml',
  }
}
