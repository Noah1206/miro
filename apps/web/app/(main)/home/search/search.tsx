'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { tween } from '@/lib/motion/tokens'

/**
 * 검색 머리 — 로고·제목 오른쪽의 돋보기를 누르면 검색창이 위에서 아래로 내려온다.
 * 검색어가 있으면 열린 채로 시작한다. Esc 나 X 로 닫고, 비우면 전체로 돌아간다.
 * `base` 는 검색 결과가 열리는 경로다 — 일반 캐릭터 검색은 /home/search.
 */
export function SearchHeader({ q, base, children }: { q: string; base: string; children: React.ReactNode }) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(q.length > 0)
  const [value, setValue] = useState(q)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) input.current?.focus() }, [open])

  const submit = () => router.push(value.trim() ? `${base}?q=${encodeURIComponent(value.trim())}` : base)
  const close = () => { setOpen(false); if (q) { setValue(''); router.push(base) } }

  return (
    <header style={{ padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--gutter) var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {children}
        <button type="button" onClick={() => (open ? close() : setOpen(true))} aria-expanded={open} aria-controls="character-search" aria-label={open ? '검색 닫기' : '검색'}
          style={{ marginLeft: 'auto', marginRight: -8, width: 40, height: 40, borderRadius: 20, display: 'grid', placeItems: 'center', background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
          {open
            ? <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            : <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>}
        </button>
      </div>

      {/* 위에서 아래로 — 높이가 0 에서 자라며 내려온다. 닫힐 때는 같은 길로 올라간다. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id="character-search" key="search"
            initial={reduce ? false : { height: 0, opacity: 0, y: -8 }} animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -8, transition: { duration: 0.18 } }} transition={tween.enter}
            style={{ overflow: 'hidden' }}>
            <form role="search" onSubmit={(e) => { e.preventDefault(); submit() }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'var(--space-4)', padding: '0 12px', minHeight: 42, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)' }}>
              <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
              </svg>
              <input ref={input} type="search" name="q" value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} enterKeyHint="search"
                placeholder="이름, 분위기, 키워드" aria-label="캐릭터 검색" autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault()
                  if (e.key === 'Escape') close()
                }}
                style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 14 }} />
              {value && (
                <button type="button" onClick={() => { setValue(''); input.current?.focus(); if (q) router.push(base) }} aria-label="검색어 지우기" className="hit"
                  style={{ background: 'none', border: 0, padding: 2, color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0 }}>
                  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
