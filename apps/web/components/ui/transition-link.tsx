'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { forwardRef, useEffect, type ComponentProps, type MouseEvent } from 'react'
import { settleNavigation, startNavigation } from '@/lib/motion/view-transition'

type Props = ComponentProps<typeof Link> & { direction?: 'forward' | 'back' }

/** Link 와 똑같이 쓰되 전환을 View Transition 으로 감싼다. 새 탭·수정키 클릭은 브라우저에 맡긴다. */
export const TransitionLink = forwardRef<HTMLAnchorElement, Props>(function TransitionLink({ direction = 'forward', onClick, href, ...rest }, ref) {
  const router = useRouter()
  return (
    <Link ref={ref} href={href} {...rest} onClick={(e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e)
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      if (typeof href !== 'string') return
      e.preventDefault()
      startNavigation(direction, () => router.push(href))
    }} />
  )
})

/** 루트 레이아웃에 하나. pathname 이 바뀌면 진행 중인 전환을 마무리한다. */
export function ViewTransitionResolver() {
  const pathname = usePathname()
  useEffect(() => { settleNavigation() }, [pathname])
  useEffect(() => {
    const onPop = () => { document.documentElement.dataset.nav = 'back' }
    window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop)
  }, [])
  return null
}
