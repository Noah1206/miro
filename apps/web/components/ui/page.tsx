'use client'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { tween } from '@/lib/motion/tokens'
import { TransitionLink } from './transition-link'

/** 직접 진입(새로고침·딥링크)에도 같은 등장: fade + y 12. View Transition 이 담당하는 링크 이동과 결이 같다. */
export function Page({ children, immersive, className, style }: { children: ReactNode; immersive?: boolean; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion()
  return (
    <motion.main id="main" tabIndex={-1} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={tween.enter}
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

export function PageHeader({ eyebrow, title, lead, back }: { eyebrow?: string; title: string; lead?: string; back?: string }) {
  return (
    <header className="stack" style={{ gap: 6, marginBottom: 'var(--space-5)' }}>
      {back && <Back href={back} />}
      {eyebrow && <p className="t-micro">{eyebrow}</p>}
      <h1 className="t-title-1">{title}</h1>
      {lead && <p className="t-body" style={{ color: 'var(--color-text-secondary)' }}>{lead}</p>}
    </header>
  )
}
