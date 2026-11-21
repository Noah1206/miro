'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/client'

/**
 * 11/21 사용자: 화면이 다 준비될 때까지는 반쯤 그려진 화면·뼈대 대신 화면 정가운데에 동그랗게 돌아가는 표시 하나만
 * (처음엔 통통 튀는 점 세 개였다가 같은 날 '동글동글 돌아가는 걸로'). cover 면 바탕까지 덮는다.
 */
export function LoadingDots({ cover = false }: { cover?: boolean }) {
  const t = useT()
  return <div role="status" aria-live="polite" style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'grid', placeItems: 'center', pointerEvents: cover ? 'auto' : 'none', ...(cover ? { background: 'var(--color-bg)' } : {}) }}>
    <span className="sr-only">{t('불러오는 중')}</span>
    <span className="route-spinner" aria-hidden />
  </div>
}

/** 첫 접속: 서버 HTML 은 돌아가는 표시만 덮어 보여 주고, 화면이 살아난(하이드레이션) 뒤에 걷는다 — 반쯤 그려진 화면이 보이지 않게. */
export function HydrationCover() {
  const [on, setOn] = useState(true)
  useEffect(() => { const id = requestAnimationFrame(() => setOn(false)); return () => cancelAnimationFrame(id) }, [])
  return on ? <LoadingDots cover /> : null
}
