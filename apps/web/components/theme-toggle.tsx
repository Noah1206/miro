'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/client'

/** 11/27 사용자: 헤더의 라이트/다크 전환 — html[data-theme] 를 바꾸고 이 기기에 기억한다(첫 그리기 전 적용은 app/layout.tsx 의 스크립트). */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT()
  const [light, setLight] = useState(false)
  useEffect(() => { setLight(document.documentElement.dataset.theme === 'light') }, [])
  const toggle = () => {
    const next = !light
    setLight(next)
    if (next) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme
    try { localStorage.setItem('miro:theme', next ? 'light' : 'dark') } catch { /* 저장소를 막은 브라우저 — 이번 화면에서만 */ }
  }
  return (
    <button type="button" className={className} onClick={toggle} aria-label={t(light ? '다크 모드로' : '라이트 모드로')} aria-pressed={light}
      style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {light ? <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
      </svg>
    </button>
  )
}
