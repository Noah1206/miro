'use client'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { fadeUp, stagger, tween } from '@/lib/motion/tokens'
import { TransitionLink } from './transition-link'

/**
 * 직접 진입(새로고침·딥링크)에도 같은 등장: fade + y 12. View Transition 이 담당하는 링크 이동과 결이 같다.
 * variant 트리의 뿌리 — 안쪽의 Card·Notice·Field·PageHeader 줄은 `fadeUp` variants 만 들고 있으면
 * 여기서 120ms 간격으로 차례로 나타난다. 나중에 마운트되는 것(오류 안내 등)도 같은 등장을 탄다.
 * Reduce Motion 이면 initial=false 가 하위 전체에 전파되어 바로 있다.
 */
export function Page({ children, immersive, className, style }: { children: ReactNode; immersive?: boolean; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion()
  return (
    <motion.main id="main" tabIndex={-1} initial={reduce ? false : 'hidden'} animate="show"
      variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { ...tween.enter, staggerChildren: stagger.normal } } }}
      className={`page ${immersive ? 'page--immersive' : ''} ${className ?? ''}`} style={{ outline: 'none', ...style }}>
      {children}
    </motion.main>
  )
}

/** 뒤로 가기. 화살표 하나, 조용하게. */
export function Back({ href, label = '뒤로' }: { href: string; label?: string }) {
  return (
    <TransitionLink href={href} direction="back" aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', fontSize: 'var(--font-caption)', padding: '6px 0' }}>
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
    </TransitionLink>
  )
}

/** 줄 단위로 나타난다: 눈썹 → 제목 → 리드. */
export function PageHeader({ eyebrow, title, lead, back, align }: { eyebrow?: string; title: string; lead?: string; back?: string; align?: 'center' }) {
  return (
    <motion.header className="stack" variants={{ hidden: {}, show: { transition: { staggerChildren: stagger.normal } } }}
      style={{ gap: 6, marginBottom: 'var(--space-5)', ...(align === 'center' ? { alignItems: 'center', textAlign: 'center' } : {}) }}>
      {back && <motion.div variants={fadeUp} style={align === 'center' ? { alignSelf: 'flex-start' } : undefined}><Back href={back} /></motion.div>}
      {eyebrow && <motion.p className="t-micro" variants={fadeUp}>{eyebrow}</motion.p>}
      <motion.h1 className="t-title-1" variants={fadeUp}>{title}</motion.h1>
      {lead && <motion.p className="t-body" variants={fadeUp} style={{ color: 'var(--color-text-secondary)' }}>{lead}</motion.p>}
    </motion.header>
  )
}
