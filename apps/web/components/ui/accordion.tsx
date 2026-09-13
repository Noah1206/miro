'use client'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'
import { tween } from '@/lib/motion/tokens'

/**
 * height: 0 → auto. Motion 이 실제 높이를 재서 transform 없이도 주변 요소가 함께 밀린다 (Layout Animation).
 * 내용은 열림/닫힘과 무관하게 DOM 에 있다 — 폼 필드가 제출에 포함된다.
 */
export function Accordion({ title, defaultOpen = false, children, right }: { title: ReactNode; defaultOpen?: boolean; children: ReactNode; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div style={{ borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)', overflow: 'hidden' }}>
      <button id={`${id}-btn`} type="button" aria-expanded={open} aria-controls={id} aria-label={typeof title === 'string' ? title : undefined} onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', background: 'transparent', border: 0, textAlign: 'left' }}>
        <span className="t-title-3">{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {right}
          <motion.svg width="16" height="16" viewBox="0 0 16 16" fill="none" animate={{ rotate: open ? 180 : 0 }} transition={tween.enter}>
            <path d="M4 6l4 4 4-4" stroke="var(--color-text-secondary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        </span>
      </button>
      <motion.div id={id} role="region" aria-labelledby={`${id}-btn`} initial={false} animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }} transition={tween.enter}
        style={{ overflow: open ? 'visible' : 'hidden' }}>
        <div style={{ padding: '0 20px 20px' }}>{children}</div>
      </motion.div>
      <AnimatePresence />
    </div>
  )
}
