'use client'
import { AnimatePresence, motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { spring, tween } from '@/lib/motion/tokens'

type Toast = { id: number; text: string; tone?: 'default' | 'relationship' | 'error'; href?: string }
const Ctx = createContext<(text: string, tone?: Toast['tone'], href?: string) => void>(() => {})
export const useToast = () => useContext(Ctx)

/**
 * Enter(y 16→0, fade) → Stay 2.6s(href 가 있으면 6s, 누르면 이동) → Exit. 여러 개면 layout 으로 밀린다.
 * 11/18 tone 'error' — 화면 위에서 빨간 아이콘과 함께 내려왔다가 위로 빠르게 사라진다(잔액 부족 등 막힌 동작).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const seq = useRef(0)
  const router = useRouter()
  const push = useCallback((text: string, tone: Toast['tone'] = 'default', href?: string) => {
    const id = ++seq.current
    setItems((s) => [...s.slice(-2), { id, text, tone, href }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), href ? 6000 : 2600)
  }, [])
  const errors = items.filter(t => t.tone === 'error')
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="app-fixed" style={{ position: 'fixed', bottom: 'calc(var(--nav-h) + 16px)', zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
        <AnimatePresence initial={false}>
          {items.filter(t => t.tone !== 'error').map((t) => (
            <motion.div key={t.id} layout onClick={t.href ? () => router.push(t.href!) : undefined} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8, transition: tween.exit }} transition={spring.default}
              style={{ pointerEvents: t.href ? 'auto' : undefined, cursor: t.href ? 'pointer' : undefined, padding: '10px 16px', borderRadius: 'var(--radius-button)', background: 'var(--color-surface-3)', border: `1px solid ${t.tone === 'relationship' ? 'var(--color-accent)' : 'var(--color-border-strong)'}`, fontSize: 'var(--font-caption)', boxShadow: 'var(--shadow-soft)', color: t.tone === 'relationship' ? 'var(--color-accent-text)' : 'var(--color-text-primary)' }}>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div role="alert" className="app-fixed" style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', zIndex: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
        <AnimatePresence initial={false}>
          {errors.map((t) => (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: -48 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -48, transition: { duration: 0.16, ease: 'easeIn' } }} transition={spring.default}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 10px 12px', borderRadius: 'var(--radius-button)', background: 'var(--color-surface-3)', border: '1px solid var(--color-border-strong)', fontSize: 'var(--font-caption)', boxShadow: 'var(--shadow-soft)', color: 'var(--color-text-primary)' }}>
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" style={{ flex: 'none' }}><circle cx="12" cy="12" r="11" fill="var(--color-danger)" /><path d="M12 6.5v7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /><circle cx="12" cy="17.3" r="1.4" fill="#fff" /></svg>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}
