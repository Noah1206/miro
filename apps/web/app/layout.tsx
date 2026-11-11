import { currentUser } from '@/lib/auth'
import { visitorConsent } from '@/lib/visitor-consent'
import { VisitorConsent } from '@/components/visitor-consent'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { Providers } from '@/components/ui/providers'
import { LanguageProvider } from '@/lib/i18n/client'
import { getLanguage, getT, messagesFor } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  // 탭 제목은 어느 화면에서나 이 한 줄로 고정한다(2026-09-30 요청) — 문장 | 서비스 이름. template 에 %s 가 없어 각 화면이 정한 제목은 쓰이지 않는다.
  const title = `${t('최애 캐릭터를 현실에서 만나봐')} | ${t('AI 캐릭터챗 MIRO')}`
  // 11/12 링크 미리보기 그림 — 미로 시그니처 캐릭터 8명(미로·가린·문자 요정·서하·채이·다온·하진·수아), 짙은 라벤더 단색 배경·흰 굵은 MIRO(사용자 선택 A안, 힉스필드 생성 + 글씨는 직접 얹음, output/share-image). 파일 이름을 바꿔야 메신저 캐시가 새로 받는다.
  const shareImage = { url: '/miro-share-v2.png', width: 1200, height: 630, alt: 'MIRO' }
  return {
    metadataBase: new URL('https://miroapp.app'),
    title: { default: title, template: title }, manifest: '/manifest.json',
    applicationName: 'MIRO',
    appleWebApp: { capable: true, title: 'MIRO', statusBarStyle: 'black-translucent' },
    openGraph: {
      type: 'website', siteName: 'MIRO', title, images: [shareImage],
    },
    twitter: {
      card: 'summary_large_image', title, images: [shareImage],
    },
    // 탭은 현재 로고 + 차콜 타일. v5로 기존 브라우저 캐시를 갱신한다.
    icons: {
      icon: [
        { url: '/favicon.ico?v=5', sizes: '16x16 32x32 48x48' },
        { url: '/favicon-16.png?v=5', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32.png?v=5', sizes: '32x32', type: 'image/png' },
        { url: '/favicon.svg?v=5', sizes: 'any', type: 'image/svg+xml' },
      ],
      apple: '/icon-180.png?v=4',
    },
  }
}
export const viewport: Viewport = { themeColor: '#1c1c1c', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const needsConsent = !(await currentUser()) && !(await visitorConsent())
  const language = await getLanguage()
  const t = await getT()
  return (
    <html lang={language === 'zh' ? 'zh-CN' : language}>
      <head>
        <Script id="google-ads-init" strategy="beforeInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'AW-18512422714');
        `}</Script>
        {/* 스크립트 본체는 화면이 반응하기 시작한 뒤에(10/27) — beforeInteractive 면 첫 화면이 이 외부 스크립트를 기다렸다. 위 초기화가 그 사이 기록을 줄 세운다. */}
        <Script src="https://www.googletagmanager.com/gtag/js?id=AW-18512422714" strategy="afterInteractive" />
        {/* 서체는 HTML 에서 바로 잇는다. globals.css 의 @import 였을 때는 CSS 를 받은 뒤에야 요청이 시작됐다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>
        <LanguageProvider language={language} messages={messagesFor(language)}>
          <a href="#main" className="skip-link">{t('본문으로 건너뛰기')}</a><Providers>{children}<VisitorConsent needed={needsConsent} /></Providers>
        </LanguageProvider>
        <Analytics />
      </body>
    </html>
  )
}
