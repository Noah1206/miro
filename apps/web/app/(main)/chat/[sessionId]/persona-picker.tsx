'use client'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { UserPersona } from '@miro/domain'
import { useT } from '@/lib/i18n/client'
import { ease } from '@/lib/motion/tokens'
import { useRoomControls } from '@/components/room-controls'
import { saveConversationPersonaAction } from '@/app/(main)/persona/actions'
import sheet from './model-picker.module.css'

/**
 * 채팅방 페르소나 드롭다운(11/3 사용자: 대화 전 페르소나 화면 대신 채팅방에서 드롭다운으로) — 모델 선택 알약 옆.
 * 내 기본 페르소나 · 만든 사람이 준비한 페르소나 중에서 고르면 이 대화의 '나'가 바로 바뀐다. '직접 쓰기'는 방 메뉴의 페르소나 칸을 연다.
 */
export function PersonaPicker({ sessionId, current, mine, presets, disabled = false }: { sessionId: string; current: UserPersona | null; mine: UserPersona | null; presets: UserPersona[]; disabled?: boolean }) {
  const t = useT(), router = useRouter(), reduce = useReducedMotion()
  const { openRoomPanel } = useRoomControls()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [saving, start] = useTransition()
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const same = (a: UserPersona | null, b: UserPersona) => !!a && a.name === b.name && a.gender === b.gender && (a.description ?? '') === (b.description ?? '')
  const pick = (p: UserPersona) => start(async () => {
    const form = new FormData()
    form.set('sessionId', sessionId); form.set('name', p.name); form.set('gender', p.gender ?? ''); form.set('description', p.description ?? '')
    const result = await saveConversationPersonaAction(null, form)
    if (result?.error) { setError(t(result.error)); return }
    setError(''); setOpen(false); router.refresh()
  })
  const options: Array<{ key: string; group: string; p: UserPersona }> = [
    ...(mine ? [{ key: 'mine', group: t('내 페르소나'), p: mine }] : []),
    ...presets.map((p, i) => ({ key: `preset-${i}`, group: t('준비된 페르소나'), p })),
  ]
  const row = (key: string, p: UserPersona, on: boolean) => <button key={key} type="button" className={sheet.option} aria-pressed={on} disabled={saving} onClick={() => pick(p)} style={{ minHeight: 0 }}>
    <span style={{ minWidth: 0, flex: 1, display: 'grid', gap: 3 }}>
      <strong style={{ fontSize: 14, fontWeight: 600 }}>{p.name}{p.gender && <span style={{ fontWeight: 400, color: '#a6a6af' }}> · {t(p.gender === 'female' ? '여성' : '남성')}</span>}</strong>
      {p.description && <span style={{ fontSize: 12.5, lineHeight: 1.45, color: '#a6a6af', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</span>}
    </span>
    {on && <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-lavender-500)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 2 }}><path d="m5 12 5 5 9-10" /></svg>}
  </button>
  return <div ref={root} className={sheet.root} data-place="up">
    <button type="button" className={sheet.trigger} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
      aria-label={`${t('페르소나 선택')}${current ? `: ${current.name}` : ''}`} onClick={() => setOpen(o => !o)}>
      <svg aria-hidden className={sheet.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>
      <span className={sheet.brand}>{current?.name ?? t('페르소나')}</span>
      <motion.svg animate={{ rotate: open ? 180 : 0 }} transition={{ duration: reduce ? 0 : .18, ease: ease.standard }} aria-hidden width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></motion.svg>
    </button>
    <AnimatePresence>{open && <motion.div id={panelId} role="dialog" aria-label={t('페르소나 선택')} className={sheet.panel}
      initial={reduce ? false : { opacity: 0, y: 6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduce ? 0 : 4 }} transition={{ duration: reduce ? 0 : .18, ease: ease.enter }}>
      <div className={sheet.panelHead}>{t('이 대화의 나')}</div>
      <div className={sheet.options}>
        {[...new Set(options.map(o => o.group))].map(group => <div key={group}>
          <p style={{ margin: '8px 9px 4px', fontSize: 12, color: '#8b8b92' }}>{group}</p>
          {options.filter(o => o.group === group).map(o => row(o.key, o.p, same(current, o.p)))}
        </div>)}
        {error && <p role="alert" style={{ margin: '6px 9px', fontSize: 12.5, color: 'var(--color-danger)' }}>{error}</p>}
        <button type="button" className={sheet.option} style={{ minHeight: 0, color: 'var(--color-lavender-200, #d9cfff)' }} onClick={() => { setOpen(false); openRoomPanel('persona') }}>{t('직접 쓰기')}</button>
      </div>
    </motion.div>}</AnimatePresence>
  </div>
}
