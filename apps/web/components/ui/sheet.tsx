'use client'
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { spring, tween } from '@/lib/motion/tokens'
import { useFocusTrap } from '@/lib/motion/use-focus-trap'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** 화면 높이 대비 열린 높이. drag 로 half ↔ full 스냅. */
  snap?: { half: number; full: number }
}

/**
 * Bottom Sheet = backdrop opacity + sheet translateY(spring) + drag + release velocity + snap + dismiss.
 * 손가락과 시트가 직접 연결된다 (dragElastic 이 경계 rubber band). 열린 뒤에도 항상 잡을 수 있다.
 * 시트 안에서의 세로 스크롤은 브라우저에 두고, 손잡이·헤더에서만 drag 를 잡는다.
 */
export function Sheet({ open, onClose, title, children, snap = { half: 0.55, full: 0.92 } }: Props) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(ref, open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const heightPx = (r: number) => Math.round(vh * r)

  function onDragEnd(_: unknown, info: PanInfo) {
    const y = info.offset.y, v = info.velocity.y
    // 거리 + 속도. 빠르게 아래로 던지면 거리가 짧아도 닫힌다.
    if (v > 900 || y > heightPx(snap.half) * 0.45) onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="backdrop" onClick={onClose} aria-hidden
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween.enter}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)' }} />
          <motion.div key="sheet" ref={ref} role="dialog" aria-modal tabIndex={-1} aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : '시트'}
            initial={reduce ? { y: 0, opacity: 0 } : { y: '100%' }}
            animate={reduce ? { y: 0, opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0, transition: tween.exit } : { y: '100%', transition: { ...tween.exit, duration: 0.2 } }}
            transition={spring.default}
            drag={reduce ? false : 'y'} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.06, bottom: 0.5 }} onDragEnd={onDragEnd}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61, maxHeight: `${snap.full * 100}dvh`,
              background: 'var(--color-surface-2)', borderTop: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sheet) var(--radius-sheet) 0 0', touchAction: 'none',
              paddingBottom: 'env(safe-area-inset-bottom)', display: 'flex', flexDirection: 'column',
              maxWidth: 720, margin: '0 auto',
            }}>
            <div aria-hidden style={{ padding: '10px 0 4px', display: 'grid', placeItems: 'center', cursor: 'grab' }}>
              <span style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border-strong)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px var(--space-4) 12px var(--space-5)' }}>
              {title ? <h2 id={titleId} className="t-title-3">{title}</h2> : <span />}
              {/* 드래그·Escape·배경 탭의 대안: 항상 보이는 닫기 (2.5.7) */}
              <button type="button" onClick={onClose} aria-label="닫기" style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-primary)', display: 'grid', placeItems: 'center' }}>
                <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
            <div style={{ overflowY: 'auto', padding: '0 var(--space-5) var(--space-5)', touchAction: 'pan-y' }} onPointerDown={(e) => e.stopPropagation()}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
