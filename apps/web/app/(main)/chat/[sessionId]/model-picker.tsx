'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { Sheet, TransitionLink } from '@/components/ui'
import styles from './chat.module.css'
import sheet from './model-picker.module.css'

const Selection = createContext({ model: 'miro', setModel: (_model: string) => {} })
export function ChatModelProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState('miro')
  return <Selection.Provider value={{ model, setModel }}>{children}</Selection.Provider>
}
export const useChatModel = () => useContext(Selection)
/** 'pro' is the server-side model choice; ECHO is the product name shown for it. */
export function ModelPicker({ freeReady, proReady, isPro }: { freeReady: boolean; proReady: boolean; isPro: boolean }) {
  const { model, setModel } = useChatModel()
  const [open, setOpen] = useState(false)
  return <div className={styles.stylePicker}>
    <button type="button" className={styles.styleButton} aria-label="AI 모델 선택" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
      {model === 'pro' ? 'ECHO' : 'MIRO'}
      <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title="모델 선택" snap={{ half: 0.7, full: 0.9 }}>
      <div className={sheet.content}>
        <p className={sheet.description}>MIRO 기본 대화는 무료예요. ECHO와 추가 인터랙션은 사용량이 차감돼요.</p>
        <TransitionLink className={sheet.planLink} href="/my/subscription">현재 요금제 · {isPro ? 'Pro' : 'Free'} <span aria-hidden>↗</span></TransitionLink>
        <TransitionLink className={sheet.planLink} href="/recharge">충전소 <span aria-hidden>↗</span></TransitionLink>
        <div className={sheet.cards}>
          <button type="button" className={sheet.card} aria-pressed={model === 'miro'} disabled={!freeReady} onClick={() => { setModel('miro'); setOpen(false) }}>
            <span className={sheet.cardHeading}><strong>MIRO</strong>{model === 'miro' && <span aria-label="선택됨">✓</span>}</span>
            <span className={sheet.cardLead}>편하게 이어가는 일상 대화 · 무료</span>
            <span className={sheet.badge}>{freeReady ? '기본 선택' : '준비 중'}</span>
          </button>
          <button type="button" className={sheet.card} aria-pressed={model === 'pro'} disabled={!isPro || !proReady} onClick={() => { setModel('pro'); setOpen(false) }}>
            <span className={sheet.cardHeading}><strong>ECHO</strong>{model === 'pro' && <span aria-label="선택됨">✓</span>}</span>
            <span className={sheet.cardLead}>더 깊게 이어가는 대화 · Pro 전용</span>
            <span className={sheet.badge}>{!proReady ? '준비 중' : isPro ? '이용 가능' : 'Pro 전용'}</span>
          </button>
        </div>
      </div>
    </Sheet>
  </div>
}
