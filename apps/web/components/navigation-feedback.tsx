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
    <div style={visible ? { display: 'none' } : undefined} aria-hidden={visible} inert={visible}>{children}</div>
    {visible && <LoadingDots />}
  </>
}
