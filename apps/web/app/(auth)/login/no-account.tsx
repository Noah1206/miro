'use client'
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { tween } from '@/lib/motion/tokens'

/** "계정이 없으신가요?" — 가입 화면으로 보내지 않는다. 같은 버튼이 곧 가입이다. */
export function NoAccount() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
      <button type="button" aria-expanded={open} aria-controls="no-account-help" onClick={() => setOpen((o) => !o)}
        style={{ background: 'transparent', border: 0, padding: '8px 4px', minHeight: 32, color: 'var(--color-text-secondary)', fontSize: 'var(--font-caption)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
        계정이 없으신가요?
      </button>
      <AnimatePresence>
        {open && (
          <motion.p id="no-account-help" className="t-caption" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tween.enter} style={{ marginTop: 6 }}>
            따로 가입하지 않아도 돼요. 위 버튼으로 계속하면 처음일 때 MIRO 계정이 만들어져요.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
