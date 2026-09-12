'use client'
import type { ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import { fadeUp } from '@/lib/motion/tokens'

type Motionish<T extends keyof HTMLElementTagNameMap> = Omit<HTMLMotionProps<T>, 'ref' | 'style' | 'children'> & { style?: React.CSSProperties; children?: ReactNode }

/** Dark UI 에서는 그림자보다 테두리. 카드 radius 12–16. Page 의 등장 순서를 물려받는다 (fadeUp variants). */
export function Card({ children, style, level = 1, ...rest }: Motionish<'section'> & { level?: 1 | 2 | 3 }) {
  return (
    <motion.section variants={fadeUp} {...rest} className={`hoverable ${rest.className ?? ''}`} style={{
      background: `var(--color-surface-${level})`, border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', ...style,
    }}>{children}</motion.section>
  )
}

/** Chip / Tag — pill 이 허용되는 유일한 자리. */
export function Chip({ children, tone = 'default', ...rest }: React.ComponentPropsWithoutRef<'span'> & { tone?: 'default' | 'relationship' | 'strong' }) {
  const color = tone === 'relationship' ? 'var(--color-relationship)' : tone === 'strong' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'
  const border = tone === 'relationship' ? 'rgba(216,92,121,0.45)' : tone === 'strong' ? 'var(--color-border-strong)' : 'var(--color-border)'
  return (
    <span {...rest} style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, border: `1px solid ${border}`, color, fontSize: 'var(--font-micro)', letterSpacing: '0.04em', lineHeight: 1.4, whiteSpace: 'nowrap', ...rest.style }}>
      {children}
    </span>
  )
}

/**
 * 시스템 안내. Provider 미구성 같은 사실은 숨기지 않되 조용하게.
 * role 은 호출자가 정한다 (status / alert).
 */
export function Notice({ children, tone = 'muted', role = 'status', ...rest }: Motionish<'p'> & { tone?: 'muted' | 'danger' | 'relationship' }) {
  const color = tone === 'danger' ? 'var(--color-danger)' : tone === 'relationship' ? 'var(--color-relationship)' : 'var(--color-text-secondary)'
  return (
    <motion.p variants={fadeUp} {...rest} role={role} style={{ fontSize: 'var(--font-caption)', lineHeight: 1.55, padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-1)', color, ...rest.style }}>
      {children}
    </motion.p>
  )
}

export function Skeleton({ w = '100%', h = 16, r, style }: { w?: number | string; h?: number | string; r?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" aria-hidden style={{ width: w, height: h, borderRadius: r, ...style }} />
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <motion.p className="t-micro" variants={fadeUp}>{children}</motion.p>
}
