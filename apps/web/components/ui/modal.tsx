'use client'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { tween } from '@/lib/motion/tokens'
import { useFocusTrap } from '@/lib/motion/use-focus-trap'

/** 중앙 Dialog: opacity + scale 0.98 → 1. 아래에서 올라오는 UI 가 아니므로 translate 를 쓰지 않는다. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null); const titleId = useId()
  useFocusTrap(ref, open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween.enter}
          style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', padding: 24 }}>
          <motion.div ref={ref} role="dialog" aria-modal tabIndex={-1} aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98, transition: tween.exit }} transition={tween.enter}
            style={{ width: '100%', maxWidth: 400, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', boxShadow: 'var(--shadow-soft)' }}>
            <h2 id={titleId} className="t-title-3" style={{ marginBottom: 12 }}>{title}</h2>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
