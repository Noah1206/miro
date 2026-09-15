import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/ui/providers'

export const metadata: Metadata = {
  title: { default: 'MIRO', template: '%s · MIRO' }, manifest: '/manifest.json',
  icons: { icon: '/icon-192.png', apple: '/icon-180.png' },
}
export const viewport: Viewport = { themeColor: '#0A0A0B', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body><a href="#main" className="skip-link">본문으로 건너뛰기</a><Providers>{children}</Providers></body>
    </html>
  )
}
