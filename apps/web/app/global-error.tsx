'use client'
import './globals.css'
import { useT } from '@/lib/i18n/client'

/** 11/10 루트 레이아웃까지 실패했을 때 — 레이아웃·언어 사전이 없으니 한국어 그대로, 컴포넌트 없이 그린다. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT()
  const btn = { minHeight: 44, padding: '0 18px', borderRadius: 'var(--radius-lg)', font: 'inherit', fontSize: 15, cursor: 'pointer' } as const
  return (
    <html lang="ko">
      <body style={{ background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
        <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: '100dvh', padding: '0 16px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>{t('잠시 문제가 생겼어요')}</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>{t('잠시 후 다시 시도해 주세요.')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => reset()} style={{ ...btn, border: 0, background: 'var(--color-lavender-600)', color: 'var(--color-white)' }}>{t('다시 시도')}</button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/home" style={{ ...btn, display: 'inline-flex', alignItems: 'center', border: '1px solid var(--color-border-strong)', color: 'var(--color-text-primary)', textDecoration: 'none' }}>{t('홈으로')}</a>
          </div>
        </main>
      </body>
    </html>
  )
}
