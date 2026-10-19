'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { shiftStoryDate, storyDaysBetween, validStoryDate } from '@miro/domain'
import { Button, Sheet, useToast } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { msg } from '@/lib/i18n'
import { useTurns } from './turns'
import { setStoryDate } from './actions'
import styles from './chat.module.css'

export function StoryDate({ sessionId, date: initialDate, today, disabled = false, open: controlledOpen, onOpenChange, hideTrigger = false }: { open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean; sessionId: string; date: string | null; today: string; disabled?: boolean }) {
  const t = useT()
  const toast = useToast()
  const router = useRouter()
  const { append, live, calendarPending, setCalendarPending } = useTurns()
  const [localOpen, setLocalOpen] = useState(false)
  const open = controlledOpen ?? localOpen
  const setOpen = onOpenChange ?? setLocalOpen
  const [draft, setDraft] = useState(initialDate ?? today)
  const [pending, start] = useTransition()
  useEffect(() => { if (open) setDraft(initialDate ?? today) }, [open, initialDate, today])
  const valid = validStoryDate(draft)
  const days = initialDate && valid ? storyDaysBetween(initialDate, draft) : null
  const canSave = valid && draft !== initialDate && !pending && !live && !calendarPending
  const [year, month, day] = (initialDate ?? '').split('-').map(Number)
  const label = initialDate ? t('{year}년 {month}월 {day}일', { year: year!, month: month!, day: day! }) : t('세계관 날짜 설정')
  const preview = days === null ? t('이 날짜부터 이야기를 이어가요.') : days > 0 ? t('{days}일 뒤의 장면으로 이어져요.', { days })
    : days < 0 ? t('{days}일 전의 날짜로 이동해요. 지난 대화는 그대로 남아요.', { days: Math.abs(days) }) : t('현재 이야기의 날짜예요.')

  const apply = () => {
    if (!canSave) return
    setCalendarPending(true)
    start(async () => {
      try {
        const result = await setStoryDate(sessionId, draft, initialDate)
        if (!result.ok) {
          toast(t(result.reason === 'busy' ? msg('답변이 끝난 뒤 날짜를 바꿔 주세요.') : result.reason === 'conflict' ? msg('날짜가 바뀌었어요. 다시 선택해 주세요.')
            : result.reason === 'invalid' ? msg('올바른 날짜를 선택해 주세요.') : msg('대화를 찾을 수 없습니다.')))
          if (result.reason === 'conflict') router.refresh()
          return
        }
        if (result.message) append([result.message], { quiet: true })
        setOpen(false)
        router.refresh()
      } catch { toast(t('날짜를 저장하지 못했어요. 다시 시도해 주세요.')) }
      finally { setCalendarPending(false) }
    })
  }

  return <>
    {!hideTrigger && <button type="button" className={styles.storyDateButton} aria-label={t('세계관 날짜 선택 — {date}', { date: label })} title={label}
      aria-haspopup="dialog" aria-expanded={open} disabled={disabled || pending || !!live || calendarPending}
      onClick={() => { setDraft(initialDate ?? today); setOpen(true) }}>
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
    </button>}
    <Sheet open={open} onClose={() => { if (!pending) setOpen(false) }} title={t('세계관 날짜')}>
      <form className={styles.storyDateForm} onSubmit={e => { e.preventDefault(); apply() }}>
        <label htmlFor="story-date-input" className={styles.storyDateLabel}>{t('이야기 속 날짜를 선택해요.')}</label>
        <input id="story-date-input" name="storyDate" type="date" min="0001-01-01" max="9999-12-31" required
          className={styles.storyDateInput} value={draft} onChange={e => setDraft(e.target.value)} disabled={pending} />
        <div className={styles.storyDateShortcuts}>
          {[{ days: 1, label: t('하루 뒤') }, { days: 7, label: t('일주일 뒤') }, { days: 30, label: t('30일 뒤') }].map(item => <button key={item.days} type="button" disabled={pending}
            onClick={() => { try { setDraft(shiftStoryDate(initialDate ?? today, item.days)) } catch { toast(t('올바른 날짜를 선택해 주세요.')) } }}>{item.label}</button>)}
        </div>
        <p className={styles.storyDatePreview} aria-live="polite">{valid ? preview : t('올바른 날짜를 선택해 주세요.')}</p>
        <Button type="submit" full disabled={!canSave} status={pending ? 'loading' : 'idle'}>{t('이 날짜로 이어가기')}</Button>
      </form>
    </Sheet>
  </>
}
