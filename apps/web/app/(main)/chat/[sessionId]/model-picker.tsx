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
export function ModelPicker({ freeReady, proReady, isPro }: { freeReady: boolean; proReady: boolean; isPro: boolean }) {
  const { model, setModel } = useChatModel()
  const [open, setOpen] = useState(false)
  return <div className={styles.stylePicker}>
    <button type="button" className={styles.styleButton} aria-label="AI 모델 선택" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
      {model === 'pro' ? 'MIRO Pro' : 'MIRO'}
      <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title="모델과 요금제" snap={{ half: 0.7, full: 0.9 }}>
      <div className={sheet.content}>
        <p className={sheet.intro}>무료로 시작하는 관계,<br />Pro로 더 깊어지는 이야기.</p>
        <p className={sheet.description}>대화와 다양한 교감은 하나의 월간 사용량 안에서 이용해요. 별도 코인 충전 없이, 요금제에 맞는 모델을 선택하세요.</p>
        <TransitionLink className={sheet.planLink} href="/my/subscription">현재 요금제 · {isPro ? 'MIRO Pro' : 'MIRO Free'} <span aria-hidden>↗</span></TransitionLink>
        <div className={sheet.cards}>
          <button type="button" className={sheet.card} aria-pressed={model === 'miro'} disabled={!freeReady} onClick={() => { setModel('miro'); setOpen(false) }}>
            <span className={sheet.cardHeading}><strong>MIRO</strong>{model === 'miro' && <span aria-label="선택됨">✓</span>}</span>
            <span className={sheet.cardLead}>부담 없이 시작하는 우리 이야기</span>
            <span className={sheet.cardDescription}>기본 모델로 대화하며 캐릭터와 관계를 쌓아요.</span>
            <span className={sheet.badge}>{freeReady ? '무료 · 기본 선택' : '준비 중'}</span>
          </button>
          <button type="button" className={sheet.card} aria-pressed={model === 'pro'} disabled={!isPro || !proReady} onClick={() => { setModel('pro'); setOpen(false) }}>
            <span className={sheet.cardHeading}><strong>MIRO Pro</strong>{model === 'pro' && <span aria-label="선택됨">✓</span>}</span>
            <span className={sheet.cardLead}>더 깊게 기억하고, 더 자주 교감하도록</span>
            <span className={sheet.cardDescription}>고급 모델과 더 넉넉한 월간 사용량. 더 긴 기억과 다양한 선톡·이벤트를 준비하고 있어요.</span>
            <span className={sheet.badge}>{!proReady ? '출시 준비 중' : isPro ? 'Pro 구독에 포함' : 'Pro 전용'}</span>
          </button>
        </div>
        <p className={sheet.note}>무료도 월간 사용량 한도가 있어요. 사진·음성·영상 등 추가 교감 기능과 Pro 혜택은 준비되는 대로 안내할게요.</p>
        <TransitionLink className={sheet.details} href="/plans">요금제 자세히 알아보기 <span aria-hidden>→</span></TransitionLink>
      </div>
    </Sheet>
  </div>
}
