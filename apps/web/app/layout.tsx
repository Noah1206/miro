import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/ui/providers'
import { LanguageProvider } from '@/lib/i18n/client'
import { getLanguage, getT, messagesFor } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  // 탭 제목은 어느 화면에서나 이 한 줄로 고정한다(2026-09-30 요청) — 문장 | 서비스 이름. template 에 %s 가 없어 각 화면이 정한 제목은 쓰이지 않는다.
  const title = `${t('최애 캐릭터를 현실에서 만나봐')} | ${t('AI 캐릭터챗 MIRO')}`
  return {
    title: { default: title, template: title }, manifest: '/manifest.json',
    // 탭은 자수정 타일 + 흰 마크. v4로 기존 브라우저 캐시를 갱신한다.
    icons: {
      icon: [
        { url: '/favicon.ico?v=4', sizes: '16x16 32x32 48x48' },
        { url: '/favicon-16.png?v=4', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32.png?v=4', sizes: '32x32', type: 'image/png' },
        { url: '/favicon.svg?v=4', sizes: 'any', type: 'image/svg+xml' },
      ],
      apple: '/icon-180.png?v=3',
    },
  }
}
export const viewport: Viewport = { themeColor: '#111015', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const language = await getLanguage()
  const t = await getT()
  return (
    <html lang={language === 'zh' ? 'zh-CN' : language}>
      <head>
        {/* 서체는 HTML 에서 바로 잇는다. globals.css 의 @import 였을 때는 CSS 를 받은 뒤에야 요청이 시작됐다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>
        <LanguageProvider language={language} messages={messagesFor(language)}>
          <a href="#main" className="skip-link">{t('본문으로 건너뛰기')}</a><Providers>{children}</Providers>
        </LanguageProvider>
      </body>
    </html>
  )
}
