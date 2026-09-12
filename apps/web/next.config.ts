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
}

export default config
