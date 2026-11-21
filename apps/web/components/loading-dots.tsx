'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/client'

/**
 * 11/21 사용자: 화면이 다 준비될 때까지는 반쯤 그려진 화면·뼈대 대신 가운데에 통통 튀는 점 세 개만.
 * 모양은 인트로 '입력 중' 점(.intro-typing)과 같다. cover 면 화면 전체를 덮는다.
 */
export function LoadingDots({ cover = false }: { cover?: boolean }) {
  const t = useT()
  return <div role="status" aria-live="polite" style={{ display: 'grid', placeItems: 'center', ...(cover
    ? { position: 'fixed', inset: 0, zIndex: 90, background: 'var(--color-bg)' }
    : { minHeight: '60dvh' }) }}>
    <span className="sr-only">{t('불러오는 중')}</span>
    <span className="intro-typing" aria-hidden><span /><span /><span /></span>
  </div>
}

/** 첫 접속: 서버 HTML 은 점만 덮어 보여 주고, 화면이 살아난(하이드레이션) 뒤에 걷는다 — 반쯤 그려진 화면이 보이지 않게. */
export function HydrationCover() {
  const [on, setOn] = useState(true)
  useEffect(() => { const id = requestAnimationFrame(() => setOn(false)); return () => cancelAnimationFrame(id) }, [])
  return on ? <LoadingDots cover /> : null
}
