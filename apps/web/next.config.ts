import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // 통화 기능에서만 마이크/카메라. 동의 후 해당 화면에서 브라우저가 묻는다.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
]

const config: NextConfig = {
  transpilePackages: ['@miro/domain', '@miro/db', '@miro/config', '@miro/providers', '@miro/engine'],
  poweredByHeader: false,
  async headers() { return [{ source: '/(.*)', headers: securityHeaders }] },
  /** 온보딩 소개 페이지는 없앴다 (E-44). 옛 링크는 로그인 무대로. */
  async redirects() { return [{ source: '/onboarding', destination: '/login', permanent: false }] },
}

export default config
