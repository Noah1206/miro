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
]

const config: NextConfig = {
  // 검증용 두 번째 dev 서버(테스트 DB)가 같은 .next 를 덮어쓰지 않게 — 기본은 그대로 .next.
  ...(process.env.MIRO_DIST_DIR ? { distDir: process.env.MIRO_DIST_DIR } : {}),
  transpilePackages: ['@miro/domain', '@miro/db', '@miro/config', '@miro/providers', '@miro/engine'],
  poweredByHeader: false,
  // Up to five 5MB character photos plus form data.
  experimental: { serverActions: { bodySizeLimit: '26mb' } },
  async headers() { return [{ source: '/(.*)', headers: securityHeaders }] },
  // 없어진 페이지의 예전 주소 — 발견·검색은 홈의 장르 칩으로 합쳤다(2026-09-30).
  // 예전 주소 — 설정 페이지는 '나' 화면 아래 메뉴로 옮겼다(2026-10-01).
  async redirects() { return [...['/discover', '/home/search'].map(source => ({ source, destination: '/home', permanent: false })), { source: '/my/settings', destination: '/my', permanent: false }] },
}

export default config
