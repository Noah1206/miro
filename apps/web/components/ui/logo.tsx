'use client'
import { motion, useReducedMotion } from 'motion/react'
import { ease, tween } from '@/lib/motion/tokens'

/** MIRO 심볼: 흰 두 조각. Gradient / Glow / 3D 없음. */
export function LogoMark({ size = 28, gap = 0 }: { size?: number; gap?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="MIRO" role="img">
      <path d={`M4 ${6} h${11 - gap} l4 20 h-${11 - gap} z`} fill="#fff" />
      <path d={`M${17 + gap} ${6} h11 l-4 20 h-${11} z`} fill="#fff" opacity="0.92" />
    </svg>
  )
}

/**
 * Launch sequence (DESIGN §22): 검은 화면 → 두 조각 등장 → 가까워짐 → 하나 → 가운데가 벌어지며 세계가 열림.
 * Timeline 은 variants 의 delay 로 조립한다. reduce-motion 이면 마지막 프레임만.
 */
export function LogoIntro({ onDone }: { onDone?: () => void }) {
  const reduce = useReducedMotion()
  const piece = (dir: -1 | 1) => ({
    hidden: { opacity: 0, x: dir * 56 },
    join: { opacity: 1, x: 0, transition: { duration: 0.6, ease: ease.enter, delay: 0.15 } },
    open: { x: dir * 22, transition: { duration: 0.5, ease: ease.enter, delay: 0.95 } },
  })
  return (
    <motion.div initial={reduce ? 'open' : 'hidden'} animate={['join', 'open']} onAnimationComplete={(d) => { if (d === 'open') onDone?.() }}
      style={{ display: 'grid', placeItems: 'center', width: 96, height: 64, position: 'relative' }}>
      <motion.svg variants={piece(-1)} width="48" height="64" viewBox="0 0 24 32" style={{ position: 'absolute' }}><path d="M4 6h11l4 20H8z" fill="#fff" /></motion.svg>
      <motion.svg variants={piece(1)} width="48" height="64" viewBox="0 0 24 32" style={{ position: 'absolute' }}><path d="M5 6h11l-4 20H1z" fill="#fff" opacity="0.92" /></motion.svg>
      <motion.span className="t-micro" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { ...tween.enter, delay: 1.4 } }} style={{ position: 'absolute', top: '100%', marginTop: 14, letterSpacing: '0.34em', color: 'var(--color-text-secondary)' }}>MIRO</motion.span>
    </motion.div>
  )
}
