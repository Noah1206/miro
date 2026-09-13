'use client'
import { motion, useReducedMotion } from 'motion/react'
import { ease, duration, stagger } from '@/lib/motion/tokens'

/**
 * 동의 항목. 줄이 먼저 떠오르고, 그 줄의 체크가 뒤따라 그려진다 —
 * 체크가 한꺼번에 켜지면 토글처럼 보이고, 순서대로 오면 '확인되는 중' 으로 읽힌다.
 */
export function TermsList({ items }: { items: string[][] }) {
  const reduce = useReducedMotion()
  return (
    <motion.ul className="stack" style={{ gap: 20, listStyle: 'none', padding: 0, margin: 0 }}
      initial={reduce ? false : 'hidden'} animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger.loose, delayChildren: 0.15 } } }}>
      {items.map(([t, b]) => (
        <motion.li key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}
          variants={{
            hidden: { opacity: 0, y: 20 },
            show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.enter } },
          }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 4 }}>{t}</p>
            <p className="t-caption">{b}</p>
          </div>
          <Check reduce={Boolean(reduce)} />
        </motion.li>
      ))}
    </motion.ul>
  )
}

/** 획이 그려지듯 들어온다. reduce-motion 이면 그냥 있다. */
function Check({ reduce }: { reduce: boolean }) {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, marginTop: 2 }}>
      <motion.path d="M20 6 9 17l-5-5"
        initial={reduce ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: ease.enter, delay: 0.25 }} />
    </svg>
  )
}
