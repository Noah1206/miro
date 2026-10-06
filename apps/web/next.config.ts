import type { NextConfig } from 'next'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Workspace scripts run in apps/web; load the repository .env without overriding deployment variables.
const rootEnv = resolve(__dirname, '../../.env')
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // 통화 기능에서만 마이크/카메라. 동의 후 해당 화면에서 브라우저가 묻는다.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
  // HSTS — Vercel 기본값(2년)에 하위 도메인까지(10/6). preload 는 목록 등록을 신청할 때 붙인다.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Content-Security-Policy', value: csp() },
]

/**
 * CSP(10/6). Next.js 가 넣는 인라인 스크립트 때문에 script 는 'unsafe-inline' — nonce 로 바꾸면 모든 페이지가 동적 렌더가 된다.
 * 그래도 외부 스크립트 출처·프레임 삽입·base/object 를 막는다. 외부: 글꼴 CSS(toss·jsdelivr), 본인인증 SDK(portone), 사진(https 어디든 — 캐릭터 사진·소셜 프로필).
 * ponytail: 'unsafe-inline' 이 남아 XSS 방어는 반쯤 — 인라인 스크립트를 없애거나 nonce 로 옮길 때 뺀다.
 */
function csp() {
  const dev = process.env.NODE_ENV !== 'production'
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://cdn.portone.io${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://static.toss.im https://cdn.jsdelivr.net",
    "font-src 'self' data: https://static.toss.im https://cdn.jsdelivr.net",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    // 본인인증 창(PortOne → PG사)과 음성 통화 연결(wss).
    "connect-src 'self' https: wss:",
    'frame-src https:',
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

const config: NextConfig = {
  // 검증용 두 번째 dev 서버(테스트 DB)가 같은 .next 를 덮어쓰지 않게 — 기본은 그대로 .next.
  ...(process.env.MIRO_DIST_DIR ? { distDir: process.env.MIRO_DIST_DIR } : {}),
  transpilePackages: ['@miro/domain', '@miro/db', '@miro/config', '@miro/providers', '@miro/engine'],
  poweredByHeader: false,
  // Vercel 함수는 요청 본문을 4.5MB 까지만 받는다 — 26mb 는 운영에서 의미가 없었다(10/6). 사진은 브라우저에서 줄여 보낸다(lib/shrink-image).
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  async headers() { return [{ source: '/(.*)', headers: securityHeaders }] },
  // 없어진 페이지의 예전 주소 — 발견·검색은 홈의 장르 칩으로 합쳤다(2026-09-30).
  // 예전 주소 — 설정 페이지는 '나' 화면 아래 메뉴로 옮겼다(2026-10-01).
  async redirects() {
    return [
      // 정식 도메인 miroapp.app(10/5 구매). 예전 vercel.app 주소로 온 요청(로그인 콜백의 ?code&state 포함)은 경로 그대로 새 도메인으로 — 세션 쿠키가 새 도메인에 놓인다.
      // www ↔ apex 는 Vercel 도메인 설정(Primary)이 맡는다 — 여기서 www 를 건드리면 플랫폼 리다이렉트와 맞물려 돈다.
      // /api/cron 은 제외 — pg_cron(Supabase)이 옛 주소로 부르는데 308 을 따라가지 않아 크론이 멈췄다(10/5 21:30~).
      { source: '/:path((?!api/cron).*)', has: [{ type: 'host', value: 'miro-web-ashen.vercel.app' }], destination: 'https://miroapp.app/:path', permanent: true },
      ...['/discover', '/home/search'].map(source => ({ source, destination: '/home', permanent: false })),
      { source: '/my/settings', destination: '/my', permanent: false },
    ]
  },
}

export default config
