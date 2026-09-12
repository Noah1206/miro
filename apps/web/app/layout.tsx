import type { Metadata, Viewport } from 'next'
import { Gowun_Batang } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/ui/providers'

/** 이름과 장면의 문장에만 쓰는 세리프. UI 본문은 Pretendard. */
const display = Gowun_Batang({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-display-serif', display: 'swap', preload: false })

export const metadata: Metadata = { title: { default: 'MIRO', template: '%s · MIRO' }, description: '한 사람의 세계 안으로', manifest: '/manifest.json' }
export const viewport: Viewport = { themeColor: '#0A0A0B', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={display.variable}>
      <body><a href="#main" className="skip-link">본문으로 건너뛰기</a><Providers>{children}</Providers></body>
    </html>
  )
}
