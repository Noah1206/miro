'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArchivePageSkeleton, CharacterPageSkeleton, CreatePageSkeleton, ExplorePageSkeleton, HomePageSkeleton, MiroPageSkeleton, MyPageSkeleton, RoomPageSkeleton } from './page-skeletons'

const destinations: Record<string, ReactNode> = {
  '/home': <HomePageSkeleton />,
  '/miro': <MiroPageSkeleton />,
  '/archive': <ArchivePageSkeleton />,
  '/create': <CreatePageSkeleton />,
  '/my': <MyPageSkeleton />,
  '/explore': <ExplorePageSkeleton />,
  '/search/results': <ExplorePageSkeleton />,
}

/** 고정 주소 + 대화방·문자방·캐릭터 소개(10/27) — 서버 렌더가 오래 걸리는데 그동안 이전 화면이 멈춰 있던 곳. */
function skeletonFor(path: string): ReactNode | undefined {
  if (destinations[path]) return destinations[path]
  if (/^\/(chat|messages)\/[^/]+$/.test(path)) return <RoomPageSkeleton />
  if (/^\/character\/[^/]+$/.test(path)) return <CharacterPageSkeleton />
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
      if (destination === pathname || !skeletonFor(destination)) return
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
    {visible && skeletonFor(target.destination)}
  </>
}
