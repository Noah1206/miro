import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MIRO',
  description: 'AI 캐릭터 세계 경험',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#0E0E10',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
