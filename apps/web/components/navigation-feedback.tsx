'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LoadingDots } from './loading-dots'

export function NavigationFeedback({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [target, setTarget] = useState<{ destination: string; from: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setTarget(null)
    const onStart = (event: Event) => {
      if (timer.current) clearTimeout(timer.current)
      if (fallback.current) clearTimeout(fallback.current)
      setTarget(null)
      const href = (event as CustomEvent<string>).detail
      const destination = new URL(href, window.location.href).pathname
      if (destination === pathname) return
      timer.current = setTimeout(() => setTarget({ destination, from: pathname }), 80)
      fallback.current = setTimeout(() => setTarget(null), 15000)
    }
    const onCancel = () => {
      if (timer.current) clearTimeout(timer.current)
      if (fallback.current) clearTimeout(fallback.current)
      setTarget(null)
    }
    window.addEventListener('miro:route-start', onStart)
    window.addEventListener('popstate', onCancel)
    return () => {
      window.removeEventListener('miro:route-start', onStart)
      window.removeEventListener('popstate', onCancel)
      if (timer.current) clearTimeout(timer.current)
      if (fallback.current) clearTimeout(fallback.current)
    }
  }, [pathname])

  const visible = target !== null && target.from === pathname
  // 11/21 사용자: 뼈대 화면 대신 통통 튀는 점만 — 새 화면이 다 올 때까지.
  return <>
    <RouteProgress />
    <div style={visible ? { display: 'none' } : undefined} aria-hidden={visible} inert={visible}>{children}</div>
    {visible && <LoadingDots />}
  </>
}

/**
 * 11/21 사용자: 페이지를 옮기는 동안 화면 맨 위 가는 막대가 짙은 라벤더로 차오른다 — 누르면 80% 까지 천천히, 새 화면이 오면 끝까지 채우고 사라진다.
 * 같은 'miro:route-start' 신호(TransitionLink)를 듣는다. 뒤로 가기(popstate)는 신호가 없어 막대도 없다.
 */
function RouteProgress() {
  const pathname = usePathname()
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done'>('idle')
  const from = useRef<string | null>(null)
  useEffect(() => {
    const onStart = (event: Event) => {
      const destination = new URL((event as CustomEvent<string>).detail, window.location.href).pathname
      if (destination === window.location.pathname) return
      from.current = window.location.pathname
      setPhase('loading')
    }
    window.addEventListener('miro:route-start', onStart)
    return () => window.removeEventListener('miro:route-start', onStart)
  }, [])
  useEffect(() => {
    if (from.current === null || from.current === pathname) return
    from.current = null
    setPhase('done')
    const id = setTimeout(() => setPhase('idle'), 400)
    return () => clearTimeout(id)
  }, [pathname])
  // 15초가 지나도 안 오면 접는다(이동이 취소된 경우).
  useEffect(() => { if (phase !== 'loading') return; const id = setTimeout(() => { from.current = null; setPhase('idle') }, 15000); return () => clearTimeout(id) }, [phase])
  return phase === 'idle' ? null : <div aria-hidden className="route-progress" data-phase={phase} />
}
