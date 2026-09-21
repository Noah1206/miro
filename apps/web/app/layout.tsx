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
      <head>
        {/* 서체는 HTML 에서 바로 잇는다. globals.css 의 @import 였을 때는 CSS 를 받은 뒤에야 요청이 시작됐다. */}
        <link rel="preconnect" href="https://static.toss.im" />
        <link rel="preconnect" href="https://static.toss.im" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://static.toss.im/tps/main.css" />
        <link rel="stylesheet" href="https://static.toss.im/tps/others.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body><a href="#main" className="skip-link">본문으로 건너뛰기</a><Providers>{children}</Providers></body>
    </html>
  )
}
