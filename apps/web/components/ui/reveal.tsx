'use client'
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'
import { fadeUp, staggerParent, tween, stagger as stag } from '@/lib/motion/tokens'

/** 하나의 요소가 등장한다. 마운트 시 또는 뷰포트 진입 시(inView). */
export function Reveal({ children, delay = 0, inView, as = 'div', style, className }: {
  children: ReactNode; delay?: number; inView?: boolean; as?: 'div' | 'section' | 'li' | 'p' | 'h1' | 'h2'; style?: React.CSSProperties; className?: string
}) {
  const Tag = motion[as]
  const reduce = useReducedMotion()
  // Reduce Motion 이면 페이드조차 하지 않는다 — 내용이 바로 있어야 한다.
  const props = reduce ? { initial: false as const, animate: 'show' }
    : inView ? { initial: 'hidden', whileInView: 'show', viewport: { once: true, margin: '-10% 0px' } }
    : { initial: 'hidden', animate: 'show' }
  return <Tag {...props} variants={{ ...fadeUp, show: { ...fadeUp.show, transition: { ...tween.enter, delay } } }} style={style} className={className}>{children}</Tag>
}

/** 여러 요소를 아주 작은 시간차로. 30–70ms 를 넘기면 느려 보인다. */
export function Stagger({ children, gap = stag.normal, delay = 0, as = 'div', style, className, inView }: {
  children: ReactNode; gap?: number; delay?: number; as?: 'div' | 'ul' | 'ol' | 'section'; style?: React.CSSProperties; className?: string; inView?: boolean
}) {
  const Tag = motion[as]
  const reduce = useReducedMotion()
  const props = reduce ? { initial: false as const, animate: 'show' }
    : inView ? { initial: 'hidden', whileInView: 'show', viewport: { once: true, margin: '-10% 0px' } }
    : { initial: 'hidden', animate: 'show' }
  return <Tag {...props} variants={staggerParent(gap, delay)} style={style} className={className}>{children}</Tag>
}
export function StaggerItem({ children, as = 'div', style, className, ...rest }: { children: ReactNode; as?: 'div' | 'li' | 'article' | 'section'; style?: React.CSSProperties; className?: string } & Record<string, unknown>) {
  const Tag = motion[as]
  return <Tag variants={fadeUp} style={style} className={className} {...rest}>{children}</Tag>
}

/**
 * 스크롤 내리면 숨고 올리면 나타난다. 방향 + 임계값 + 속도.
 * 헤더 안의 정보는 DOM 에 그대로 있다 — transform 만 움직인다.
 */
export function StickyHeader({ children, threshold = 24 }: { children: ReactNode; threshold?: number }) {
  const { scrollY } = useScroll()
  const [hidden, setHidden] = useState(false)
  const last = useRef(0)
  const reduce = useReducedMotion()
  useMotionValueEvent(scrollY, 'change', (y) => {
    const dy = y - last.current
    if (Math.abs(dy) < 4) return                      // 미세한 떨림 무시
    if (y < threshold) setHidden(false)
    else if (dy > 0 && Math.abs(dy) > 8) setHidden(true)   // 빠르게 내릴 때만 숨긴다
    else if (dy < 0) setHidden(false)
    last.current = y
  })
  return (
    <motion.header
      animate={{ y: hidden && !reduce ? '-100%' : 0 }} transition={tween.enter}
      style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(var(--color-bg-rgb),0.86)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--color-border)' }}
    >{children}</motion.header>
  )
}
