'use client'
import { useEffect, useState } from 'react'
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

/** 붙었다가 다시 벌어지는 거리. 원래 마크의 간격(폭의 약 14%)의 절반만 좁힌다 — 더 붙이면 두 판이 뭉개진다. */
const JOIN_RATIO = 0.07

type Phase = 'hidden' | 'join' | 'open'

/**
 * Launch sequence (DESIGN §22): 검은 화면 → 두 판이 양쪽에서 → 서로 붙어 하나 → 가운데가 벌어지며 세계가 열림.
 * 세 단계는 차례로 일어나야 한다 — 한 번에 두 variant 를 주면 마지막 값이 이겨서 '붙는' 순간이 사라진다.
 * reduce-motion 이면 마지막 프레임만.
 */
export function LogoIntro({ onDone, size = 132 }: { onDone?: () => void; size?: number }) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<Phase>(reduce ? 'open' : 'hidden')

  useEffect(() => {
    if (reduce) { onDone?.(); return }
    setPhase('join')                                   // 마운트 직후: 양쪽에서 들어와 붙는다
    const t = setTimeout(() => setPhase('open'), 1150) // 붙은 채로 잠시 머문 뒤 열린다
    return () => clearTimeout(t)
    // onDone 은 열림이 끝날 때 한 번만 (onAnimationComplete)
  }, [reduce])                                          // eslint-disable-line react-hooks/exhaustive-deps

  const join = size * JOIN_RATIO
  const piece = (dir: -1 | 1, clip: string) => ({
    hidden: { opacity: 0, x: dir * size * 0.55, clipPath: clip },
    join: { opacity: 1, x: -dir * join, clipPath: clip, transition: { duration: 0.72, ease: ease.enter } },
    open: { opacity: 1, x: 0, clipPath: clip, transition: { duration: 0.62, ease: ease.enter } },
  })
  const img: React.CSSProperties = { position: 'absolute', inset: 0, backgroundImage: 'url(/logo-mark.png)', backgroundSize: '100% 100%', mixBlendMode: 'screen' }

  return (
    <motion.div role="img" aria-label="MIRO" initial={reduce ? false : 'hidden'} animate={phase}
      onAnimationComplete={(d) => { if (d === 'open') onDone?.() }}
      style={{ position: 'relative', width: size, height: size }}>
      <motion.div aria-hidden variants={piece(-1, LEFT)} style={img} />
      <motion.div aria-hidden variants={piece(1, RIGHT)} style={img} />
      <motion.span aria-hidden className="t-micro"
        variants={{ hidden: { opacity: 0 }, join: { opacity: 0 }, open: { opacity: 1, transition: { ...tween.enter, delay: 0.3 } } }}
        style={{ position: 'absolute', top: '100%', left: 0, right: 0, textAlign: 'center', marginTop: 14, letterSpacing: '0.34em', color: 'var(--color-text-secondary)' }}>MIRO</motion.span>
    </motion.div>
  )
}
