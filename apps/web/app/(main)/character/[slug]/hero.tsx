'use client'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useRef } from 'react'
import { CharacterVisual } from '@/components/character-visual'

/** Scroll-linked: 스크롤 위치가 곧 progress. 위로 밀면 비주얼이 조금 커지며 가라앉는다 (transform·opacity 만). */
export function DetailHero({ name, accent, slug }: { name: string; accent: string | null; slug: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.08])
  const opacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.35])
  const y = useTransform(scrollYProgress, [0, 1], [0, 40])
  const reduce = useReducedMotion()
  return (
    <div ref={ref} style={{ position: 'relative', overflow: 'hidden', borderRadius: 0 }}>
      <motion.div style={reduce ? undefined : { scale, opacity, y, transformOrigin: 'center top' }}>
        <CharacterVisual name={name} accent={accent} slug={slug} ratio="4 / 5" style={{ borderRadius: 0, border: 0 }} />
      </motion.div>
    </div>
  )
}
