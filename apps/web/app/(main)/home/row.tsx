'use client'
import { motion, useReducedMotion } from 'motion/react'
import { CharacterCard } from '@/components/character-card'
import { TransitionLink } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { duration, ease, stagger } from '@/lib/motion/tokens'
import type { HomeRow } from '@/lib/home'

/**
 * 주제를 가진 가로 스크롤 행.
 * 스냅·관성·러버밴드는 브라우저(scroll-snap)에 맡긴다 — 직접 구현하면 기기마다 다르게 느껴진다.
 */
/** href = 제목 옆 '전체 보기'. */
export function Row({ row, index, href }: { row: HomeRow; index: number; href?: string }) {
  const reduce = useReducedMotion()
  const t = useT()
  return (
    <motion.section aria-labelledby={`row-${row.key}`}
      initial={reduce ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: ease.enter, delay: 0.08 * index }}
      style={{ marginBottom: 'var(--space-7)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '0 var(--gutter)', marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <h2 id={`row-${row.key}`} className="t-title-3">{row.title}</h2>
          {row.subtitle && <p className="t-caption" style={{ margin: '4px 0 0', color: 'var(--color-text-tertiary)' }}>{row.subtitle}</p>}
        </div>
        {href && <TransitionLink href={href} className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('전체 보기')}</TransitionLink>}
      </div>
      <div className="row-scroll row-scroll--flush">
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
