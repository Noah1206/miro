'use client'
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ease, tween } from '@/lib/motion/tokens'

/**
 * MIRO 심볼 — 흰 M 의 오른팔이 주황으로 이어지고, 그 아래 주황 점 하나. 원본은 docs/brand/logo-mark-source.webp,
 * public/logo-mark.png 는 거기서 바탕을 걷어낸 투명 정사각형이다(같은 스크립트로 layer·아이콘도 만든다).
 */
export function LogoMark({ size = 28, label = 'MIRO' }: { size?: number; label?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo-mark.png" alt={label} width={size} height={size} style={{ width: size, height: size, display: 'block' }} />
}

/** 점의 중심(캔버스 기준 %) — 점은 제자리에서 커져야 한다. 마크를 다시 만들면 같이 갱신한다. */
const DOT_ORIGIN = '80.7% 76.2%'

type Phase = 'hidden' | 'join' | 'open'

/**
 * Launch sequence (DESIGN §22): 검은 화면 → 흰 M 은 왼쪽에서, 주황 팔은 오른쪽에서 → 서로 만나 하나 → 점이 찍히며 세계가 열림.
 * 세 단계는 차례로 일어나야 한다 — 한 번에 두 variant 를 주면 마지막 값이 이겨서 '만나는' 순간이 사라진다.
 * 마크는 색으로 나눈 세 층(logo-m · logo-s · logo-d)이다. reduce-motion 이면 마지막 프레임만.
 */
export function LogoIntro({ onDone, size = 156 }: { onDone?: () => void; size?: number }) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<Phase>(reduce ? 'open' : 'hidden')

  useEffect(() => {
    if (reduce) { onDone?.(); return }
    setPhase('join')                                   // 마운트 직후: 양쪽에서 들어와 만난다
    const t = setTimeout(() => setPhase('open'), 1000) // 만난 채로 잠시 머문 뒤 점이 찍힌다
    return () => clearTimeout(t)
    // onDone 은 점이 찍힌 뒤 한 번만 (onAnimationComplete)
  }, [reduce])                                          // eslint-disable-line react-hooks/exhaustive-deps

  const piece = (dir: -1 | 1) => ({
    hidden: { opacity: 0, x: dir * size * 0.5 },
    join: { opacity: 1, x: 0, transition: { duration: 0.72, ease: ease.enter } },
    open: { opacity: 1, x: 0 },
  })
  const dot = {
    hidden: { opacity: 0, scale: 0 },
    join: { opacity: 0, scale: 0 },
    open: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: ease.enter } },
  }
  const layer = (file: string): React.CSSProperties => ({ position: 'absolute', inset: 0, backgroundImage: `url(${file})`, backgroundSize: '100% 100%' })

  return (
    <motion.div role="img" aria-label="MIRO" initial={reduce ? false : 'hidden'} animate={phase}
      onAnimationComplete={(d) => { if (d === 'open') onDone?.() }}
      style={{ position: 'relative', width: size, height: size }}>
      {/* 주황 팔이 아래, 흰 M 이 위 — 원본에서 팔이 M 뒤로 들어간다. 순서를 바꾸면 이음매가 드러난다. */}
      <motion.div aria-hidden variants={piece(1)} style={layer('/logo-s.png')} />
      <motion.div aria-hidden variants={piece(-1)} style={layer('/logo-m.png')} />
      <motion.div aria-hidden variants={dot} style={{ ...layer('/logo-d.png'), transformOrigin: DOT_ORIGIN }} />
      <motion.span aria-hidden className="t-micro"
        variants={{ hidden: { opacity: 0 }, join: { opacity: 0 }, open: { opacity: 1, transition: { ...tween.enter, delay: 0.3 } } }}
        style={{ position: 'absolute', top: '100%', left: 0, right: 0, textAlign: 'center', marginTop: 14, letterSpacing: '0.34em', color: 'var(--color-text-secondary)' }}>MIRO</motion.span>
    </motion.div>
  )
}
