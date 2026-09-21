'use client'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { tween } from '@/lib/motion/tokens'
import { useFocusTrap } from '@/lib/motion/use-focus-trap'

/** 작은 UI 는 작게 움직인다: opacity + scale 0.97 + y −4px. */
export function Popover({ open, onClose, anchor = 'left', children, style }: { open: boolean; onClose: () => void; anchor?: 'left' | 'right'; children: ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div ref={ref} role="menu" tabIndex={-1} initial={{ opacity: 0, scale: 0.97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: -4, transition: tween.exit }} transition={tween.enter}
          style={{ position: 'absolute', top: 'calc(100% + 6px)', [anchor]: 0, zIndex: 50, minWidth: 220, transformOrigin: `top ${anchor}`, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: 6, boxShadow: 'var(--shadow-soft)', ...style }}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
export function MenuItem({ children, ...rest }: React.ComponentPropsWithoutRef<'button'>) {
  return <button {...rest} role="menuitem" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', minHeight: 44, background: 'transparent', border: 0, borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-body-size)', ...rest.style }}>{children}</button>
}
