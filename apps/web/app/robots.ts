import type { MetadataRoute } from 'next'

const AI_BOTS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'Google-Extended', 'GoogleOther',
  'CCBot', 'PerplexityBot', 'Perplexity-User', 'Bytespider', 'Amazonbot', 'Applebot-Extended', 'meta-externalagent', 'FacebookBot', 'cohere-ai', 'Diffbot', 'YouBot', 'Timpibot', 'ImagesiftBot', 'omgili']

/** 11/10 검색 노출 — 홈·로그인·약관만, 대화·내 정보·만들기·API·관리는 막는다. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // 11/12 사용자: AI 학습·분석용 수집 봇은 사이트 전체를 막는다(검색엔진은 아래 규칙 그대로). robots.txt 는 지키는 봇에만 효과 — 실제 차단은 Cloudflare AI Crawl Control.
      { userAgent: AI_BOTS, disallow: '/' },
      { userAgent: '*', allow: ['/', '/home', '/login', '/terms'], disallow: ['/chat', '/my', '/api', '/admin', '/create', '/messages', '/onboarding', '/character', '/search', '/explore', '/stories', '/archive', '/persona', '/recharge', '/report', '/miro', '/auth', '/deleted', '/alpha', '/dev', '/mock-media'] },
    ],
    sitemap: 'https://miroapp.app/sitemap.xml',
  }
}
