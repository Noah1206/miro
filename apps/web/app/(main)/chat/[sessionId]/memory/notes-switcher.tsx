'use client'
import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Back } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import styles from './memory.module.css'

type Tab = 'memory' | 'note'
const ORDER: Tab[] = ['memory', 'note']

/** 11/17 기억 노트 ↔ 유저노트 토글 — 페이지 이동 없이 바꾸고(주소만 replaceState), 고른 쪽으로 미끄러지며 바뀐다. 회색 바탕 위 옅은 회색 알약이 따라 움직인다. */
export function NotesSwitcher({ sessionId, initial, memory, note }: { sessionId: string; initial: Tab; memory: ReactNode; note: ReactNode }) {
  const t = useT()
  const reduce = useReducedMotion()
  const [active, setActive] = useState<Tab>(initial)
  const [dir, setDir] = useState(0)
  const go = (next: Tab) => {
    if (next === active) return
    setDir(ORDER.indexOf(next) > ORDER.indexOf(active) ? 1 : -1)
    setActive(next)
    window.history.replaceState(window.history.state, '', `/chat/${sessionId}/${next}`)
  }
  const shift = reduce ? 0 : 28
  return (
    <>
      <header className={styles.header}>
        <Back href={`/chat/${sessionId}`} />
        <div className={styles.tabs} role="tablist" aria-label={t('노트')}>
          {ORDER.map(key => (
            <button key={key} type="button" role="tab" aria-selected={active === key} className={styles.tab} onClick={() => go(key)}>
              {active === key && <motion.span layoutId="notes-pill" className={styles.pill} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }} />}
              <span className={styles.tabLabel}>{key === 'memory' ? t('기억 노트') : t('유저노트')}</span>
            </button>
          ))}
        </div>
      </header>
      <div className={styles.stage}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={active} role="tabpanel"
            initial={{ opacity: 0, x: dir * shift }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * shift }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
            {active === 'memory' ? memory : note}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )
}
