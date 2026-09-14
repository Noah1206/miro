'use client'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { tween } from '@/lib/motion/tokens'

/**
 * 처음 온 사람을 위한 말풍선 한 줄. 닫으면 이 기기에서 다시 뜨지 않는다.
 * 페이지당 하나, 한 문장 — 늘어놓으면 설명서가 되고 아무도 읽지 않는다.
 * 서버에서는 그리지 않는다: 닫았는지는 브라우저만 알아서, 먼저 그리면 깜빡인다.
 * 바깥 여백도 여기서 받는다 — 감싸는 div 에 두면 닫힌 뒤에 빈 여백만 남는다.
 */
export function Tip({ id, children, style }: { id: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const key = `miro:tip:${id}`
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  useEffect(() => {
    try { if (!localStorage.getItem(key)) setOpen(true) } catch { setOpen(true) }
  }, [key])
  function dismiss() {
    setOpen(false)
    try { localStorage.setItem(key, '1') } catch { /* 저장 못 해도 이번엔 닫힌다 */ }
  }
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div role="note" aria-label="안내"
          initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.16 } }} transition={tween.enter}
          style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px 10px 14px',
            background: 'var(--color-surface-3)', borderRadius: 'var(--radius-md)', ...style }}>
          {/* 말풍선 꼬리 */}
          <span aria-hidden style={{ position: 'absolute', top: -6, left: 18, width: 12, height: 12, background: 'var(--color-surface-3)', transform: 'rotate(45deg)', borderRadius: 2 }} />
          <span aria-hidden style={{ flexShrink: 0, marginTop: 1, width: 18, height: 18, borderRadius: 9, display: 'grid', placeItems: 'center',
            background: 'var(--color-accent)', color: 'var(--color-accent-on)', fontSize: 12, fontWeight: 700 }}>?</span>
          <span className="t-caption" style={{ flex: 1, color: 'var(--color-text-primary)', lineHeight: 1.45 }}>{children}</span>
          <button type="button" onClick={dismiss} aria-label="안내 닫기"
            style={{ flexShrink: 0, background: 'none', border: 0, padding: 2, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
