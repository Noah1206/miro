'use client'
import { motion, useReducedMotion } from 'motion/react'
import { CharacterCard } from '@/components/character-card'
import { duration, ease, stagger } from '@/lib/motion/tokens'
import type { HomeRow } from '@/lib/home'

/**
 * 주제를 가진 가로 스크롤 행.
 * 스냅·관성·러버밴드는 브라우저(scroll-snap)에 맡긴다 — 직접 구현하면 기기마다 다르게 느껴진다.
 */
export function Row({ row, index }: { row: HomeRow; index: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.section aria-labelledby={`row-${row.key}`}
      initial={reduce ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: ease.enter, delay: 0.08 * index }}
      style={{ marginBottom: 'var(--space-7)' }}>
      <h2 id={`row-${row.key}`} className="t-title-2"
        style={{ padding: '0 var(--gutter)', marginBottom: 14 }}>{row.title}</h2>
      <div className="row-scroll">
        {row.items.map((c, i) => (
          <motion.div key={`${row.key}-${c.id}`}
            initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: duration.normal, ease: ease.enter, delay: 0.08 * index + stagger.tight * i }}>
            <CharacterCard c={c} />
          </motion.div>
        ))}
      </div>
    </motion.section>
  )
}
