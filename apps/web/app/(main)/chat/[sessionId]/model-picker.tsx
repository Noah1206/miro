'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { Popover, MenuItem } from '@/components/ui'
import styles from './chat.module.css'

const Selection = createContext({ model: 'miro', setModel: (_model: string) => {} })
export function ChatModelProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState('miro')
  return <Selection.Provider value={{ model, setModel }}>{children}</Selection.Provider>
}
export const useChatModel = () => useContext(Selection)
export function ModelPicker({ freeReady, proReady, isPro }: { freeReady: boolean; proReady: boolean; isPro: boolean }) {
  const { model, setModel } = useChatModel()
  const [open, setOpen] = useState(false)
  return <div className={styles.stylePicker}>
    <button type="button" className={styles.styleButton} aria-label="AI 모델 선택" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      {model === 'pro' ? 'MIRO Pro' : 'MIRO'}
      <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <Popover open={open} onClose={() => setOpen(false)} anchor="right" style={{ minWidth: 180, padding: 4 }}>
      <MenuItem style={{ fontSize: 12, lineHeight: 1.4, minHeight: 34, padding: '8px 16px', whiteSpace: 'nowrap' }} type="button" disabled={!freeReady} aria-pressed={model === 'miro'} onClick={() => { setModel('miro'); setOpen(false) }}>
        MIRO · 기본 무료형{model === 'miro' ? ' ✓' : ''}{!freeReady ? ' · 준비 중' : ''}
      </MenuItem>
      <MenuItem style={{ fontSize: 12, lineHeight: 1.4, minHeight: 34, padding: '8px 16px', whiteSpace: 'nowrap' }} type="button" disabled={!isPro || !proReady} aria-pressed={model === 'pro'} onClick={() => { setModel('pro'); setOpen(false) }}>
        MIRO Pro{!proReady ? ' · 준비 중' : !isPro ? ' · Pro 전용' : model === 'pro' ? ' ✓' : ''}
      </MenuItem>
    </Popover>
  </div>
}
