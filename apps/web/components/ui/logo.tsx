'use client'
import { motion, useReducedMotion } from 'motion/react'
import { ease, tween } from '@/lib/motion/tokens'

/**
 * MIRO 심볼 — 기울어진 큰 판과 작은 판을 잇는 가교. 원본 마크 그대로 쓴다 (public/logo-mark.png).
 * 검정 바탕이 남은 판이어도 screen 블렌드로 어두운 배경에 녹는다.
 */
export function LogoMark({ size = 28, label = 'MIRO' }: { size?: number; label?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo-mark.png" alt={label} width={size} height={size} style={{ width: size, height: size, mixBlendMode: 'screen', display: 'block' }} />
}

/* 두 판 사이의 사선을 따라 자른다: (60%,0) → (26.7%,100%) */
const LEFT = 'polygon(0 0, 60% 0, 26.7% 100%, 0 100%)'
const RIGHT = 'polygon(60% 0, 100% 0, 100% 100%, 26.7% 100%)'

/**
 * Launch sequence (DESIGN §22): 검은 화면 → 두 판이 양쪽에서 → 서로 가까워져 하나 → 가운데가 벌어지며 세계가 열림.
 * reduce-motion 이면 마지막 프레임만.
 */
export function LogoIntro({ onDone, size = 132 }: { onDone?: () => void; size?: number }) {
  const reduce = useReducedMotion()
  const piece = (dir: -1 | 1, clip: string) => ({
    hidden: { opacity: 0, x: dir * 64, clipPath: clip },
    join: { opacity: 1, x: 0, clipPath: clip, transition: { duration: 0.6, ease: ease.enter, delay: 0.15 } },
    open: { x: dir * 18, clipPath: clip, transition: { duration: 0.5, ease: ease.enter, delay: 0.95 } },
  })
  const img: React.CSSProperties = { position: 'absolute', inset: 0, backgroundImage: 'url(/logo-mark.png)', backgroundSize: '100% 100%', mixBlendMode: 'screen' }
  return (
    <motion.div role="img" aria-label="MIRO" initial={reduce ? 'open' : 'hidden'} animate={['join', 'open']} onAnimationComplete={(d) => { if (d === 'open') onDone?.() }}
      style={{ position: 'relative', width: size, height: size }}>
      <motion.div aria-hidden variants={piece(-1, LEFT)} style={img} />
      <motion.div aria-hidden variants={piece(1, RIGHT)} style={img} />
      <motion.span aria-hidden className="t-micro" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { ...tween.enter, delay: 1.4 } }} style={{ position: 'absolute', top: '100%', left: 0, right: 0, textAlign: 'center', marginTop: 14, letterSpacing: '0.34em', color: 'var(--color-text-secondary)' }}>MIRO</motion.span>
    </motion.div>
  )
}
