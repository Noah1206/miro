'use client'
import { useState, useTransition } from 'react'
import { Popover, MenuItem } from '@/components/ui'
import styles from './chat.module.css'
import { setOutputStyle } from './actions'

const OPTIONS = [{ value: 'messenger', label: '메신저형' }, { value: 'balanced', label: '균형형' }, { value: 'narrative', label: '서사형' }]

export function StylePicker({ sessionId, current, label }: { sessionId: string; current: string; label?: string }) {
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  return <div className={styles.stylePicker}>
    <button type="button" className={styles.styleButton} aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={pending} onClick={() => setOpen(!open)}>
      {OPTIONS.find(o => o.value === current)?.label ?? '균형형'}
      <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <Popover open={open} onClose={() => setOpen(false)} anchor="right">
      {OPTIONS.map(o => <MenuItem key={o.value} type="button" aria-pressed={current === o.value} onClick={() => { setOpen(false); start(async () => { await setOutputStyle(sessionId, o.value) }) }}>
        {o.label}{current === o.value ? ' ✓' : ''}
      </MenuItem>)}
    </Popover>
  </div>
}
