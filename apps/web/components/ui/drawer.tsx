'use client'
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/lib/motion/use-focus-trap'
import { tween } from '@/lib/motion/tokens'
import styles from './drawer.module.css'

/** A room-sized right drawer, portaled above the chat header and keyboard layout. */
export function Drawer({ open, onClose, title, children, id, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; id?: string; footer?: ReactNode
}) {
  const reduce = useReducedMotion()
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const drag = useDragControls()
  useFocusTrap(ref, open)
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', escape)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', escape) }
  }, [open, onClose])
  function release(_: unknown, info: PanInfo) {
    const width = ref.current?.getBoundingClientRect().width ?? 320
    if (info.offset.x > width * .25 || info.offset.x > 12 && info.velocity.x > 800) onClose()
  }
  if (typeof document === 'undefined') return null
  return createPortal(<AnimatePresence>
    {open && <>
      <motion.div key="drawer-backdrop" className={styles.backdrop} aria-hidden="true" onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween.fast} />
      <div key="drawer-frame" className={styles.frame}>
        <motion.div id={id} ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={styles.panel}
          initial={reduce ? { opacity: 0, x: 0 } : { x: '100%' }} animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { x: '100%' }} transition={reduce ? { duration: .08 } : tween.fast}
          drag={reduce ? false : 'x'} dragControls={drag} dragListener={false} dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0, right: .45 }} onDragEnd={release}>
          <header className={styles.header} onPointerDown={event => { if (!reduce) drag.start(event) }}>
            <h2 id={titleId} className={styles.title} tabIndex={-1} data-initial-focus>{title}</h2>
          </header>
          <div className={styles.content}>{children}</div>
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </motion.div>
      </div>
    </>}
  </AnimatePresence>, document.body)
}
