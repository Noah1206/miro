'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArchivePageSkeleton, CreatePageSkeleton, HomePageSkeleton, MiroPageSkeleton, MyPageSkeleton, SearchPageSkeleton } from './page-skeletons'

const destinations: Record<string, ReactNode> = {
  '/home': <HomePageSkeleton />,
  '/miro': <MiroPageSkeleton />,
  '/home/search': <SearchPageSkeleton />,
  '/archive': <ArchivePageSkeleton />,
  '/create': <CreatePageSkeleton />,
  '/my': <MyPageSkeleton />,
}

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
      if (destination === pathname || !destinations[destination]) return
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
  return <>
    <div style={visible ? { display: 'none' } : undefined} aria-hidden={visible} inert={visible}>{children}</div>
    {visible && destinations[target.destination]}
  </>
}
