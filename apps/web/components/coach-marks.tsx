'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/client'

export type CoachStep = { target: string; title: string; example?: string }

const GAP = 12
const EDGE = 16

/**
 * 처음 온 사람에게 버튼을 하나씩 짚어 주는 코치마크(10/19, 대화 화면).
 * 대상은 data-coach="키" 로 찾는다 — 화면에 없는 대상의 단계는 건너뛴다.
 * 화면을 어둡게 깔고 대상만 비워 두며, 강조색 테두리 말풍선의 꼬리가 대상을 가리킨다.
 * 끝까지 보거나 닫으면 이 기기에서 다시 뜨지 않는다(만들기 안내 CreateTour 와 같은 localStorage 관례).
 */
export function CoachMarks({ storageKey, steps }: { storageKey: string; steps: CoachStep[] }) {
  const t = useT()
  const [list, setList] = useState<CoachStep[]>([])
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [bubble, setBubble] = useState({ top: 0, left: 0, caret: 0, below: false })
  const box = useRef<HTMLDivElement>(null)
  const nextBtn = useRef<HTMLButtonElement>(null)

  // 서버에선 그리지 않는다: 봤는지는 브라우저만 안다. 버튼이 그려진 다음 프레임에 대상을 고른다.
  useEffect(() => {
    let seen = false
    try { seen = !!localStorage.getItem(storageKey) } catch { /* 못 읽으면 보여 준다 */ }
    if (seen) return
    const id = requestAnimationFrame(() => setList(steps.filter((s) => document.querySelector(`[data-coach="${s.target}"]`))))
    return () => cancelAnimationFrame(id)
  }, [storageKey, steps])

  const step = list[i]
  const done = useCallback(() => {
    setList([])
    try { localStorage.setItem(storageKey, '1') } catch { /* 저장 못 해도 이번엔 닫힌다 */ }
  }, [storageKey])
  const next = useCallback(() => (i >= list.length - 1 ? done() : setI(i + 1)), [i, list.length, done])

  useLayoutEffect(() => {
    if (!step) return
    const place = () => {
      const el = document.querySelector<HTMLElement>(`[data-coach="${step.target}"]`)
      if (!el || !box.current) return
      const r = el.getBoundingClientRect()
      const w = box.current.offsetWidth, h = box.current.offsetHeight
      const below = r.top + r.height / 2 < window.innerHeight / 2
      const cx = r.left + r.width / 2
      const left = Math.max(EDGE, Math.min(cx - w / 2, window.innerWidth - w - EDGE))
      setRect(r)
      setBubble({ top: below ? r.bottom + GAP : r.top - GAP - h, left, caret: Math.max(18, Math.min(cx - left, w - 18)), below })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [step])

  useEffect(() => {
    if (!step) return
    nextBtn.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') done() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [step, done])

  if (!step) return null
  const pad = 6
  return (
    <div onClick={next} style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      {/* 대상만 비워 두고 나머지를 어둡게 — 그림자가 화면 전체를 덮는다. */}
      {rect && <div aria-hidden style={{ position: 'fixed', top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
        borderRadius: 14, boxShadow: '0 0 0 9999px rgba(0,0,0,.62)', pointerEvents: 'none' }} />}
      <div ref={box} role="dialog" aria-modal="true" aria-label={t('안내')} onClick={(e) => { e.stopPropagation(); next() }}
        style={{ position: 'fixed', top: bubble.top, left: bubble.left, width: 'min(340px, calc(100vw - 32px))', padding: '16px 18px', borderRadius: 18,
          background: 'var(--color-surface-2)', border: '2px solid var(--color-accent)', color: 'var(--color-text-primary)', visibility: rect ? 'visible' : 'hidden' }}>
        <span aria-hidden style={{ position: 'absolute', left: bubble.caret - 8, width: 14, height: 14, background: 'var(--color-surface-2)', transform: 'rotate(45deg)',
          ...(bubble.below ? { top: -9, borderLeft: '2px solid var(--color-accent)', borderTop: '2px solid var(--color-accent)' } : { bottom: -9, borderRight: '2px solid var(--color-accent)', borderBottom: '2px solid var(--color-accent)' }) }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.45 }}>{t(step.title)}</p>
            {step.example && <p className="t-caption" style={{ margin: '6px 0 0', color: 'var(--color-text-secondary)' }}>{t(step.example)}</p>}
          </div>
          <button ref={nextBtn} type="button" className="hit" onClick={(e) => { e.stopPropagation(); next() }}
            aria-label={i >= list.length - 1 ? t('완료') : t('다음')}
            style={{ flexShrink: 0, background: 'none', border: 0, color: 'var(--color-text-primary)', fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: 4 }}>›</button>
        </div>
        <p className="t-micro" style={{ margin: '8px 0 0', textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{i + 1}/{list.length}</p>
      </div>
    </div>
  )
}
