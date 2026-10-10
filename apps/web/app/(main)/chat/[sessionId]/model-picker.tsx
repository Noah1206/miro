'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Sheet, TransitionLink } from '@/components/ui'
import type { ChatModelChoice } from '@/lib/ai/chat-models'
import type { WalletSnapshot } from '@/lib/wallet/types'
import { useWallet } from '@/components/wallet/provider'
import styles from './chat.module.css'
import sheet from './model-picker.module.css'
import { useT, useLanguage } from '@/lib/i18n/client'
import { INTL_LOCALE } from '@/lib/i18n'

const Selection = createContext({ model: 'miro', setModel: (_model: string) => {} })
export function ChatModelProvider({ children, initialWallet, initialModel = 'miro' }: { children: ReactNode; initialWallet: WalletSnapshot; initialModel?: string }) {
  const { sync } = useWallet()
  useEffect(() => { sync(initialWallet) }, [initialWallet, sync])
  const [model, setModel] = useState(initialModel)
  return <Selection.Provider value={{ model, setModel }}>{children}</Selection.Provider>
}
export const useChatModel = () => useContext(Selection)
export function ModelPicker({ choices = [], freeReady, proReady }: { freeReady: boolean; proReady: boolean; choices?: ChatModelChoice[] }) {
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const { model, setModel } = useChatModel()
  const { wallet, openRecharge } = useWallet()
  const [open, setOpen] = useState(false)
  const selected = choices.find(c => c.id === model) ?? choices.find(c => c.length === (model === 'pro' ? 'long' : 'scene'))
  const ceiling = (c: ChatModelChoice) => wallet ? Math.min(c.maximumTokens, wallet.available) : c.maximumTokens
  return <div className={styles.stylePicker}>
    <button type="button" className={styles.styleButton} aria-label={t('AI 모델 선택')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
      {selected?.name ?? t('모델 선택')}
      <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title={t('모델 선택')} snap={{ half: 0.7, full: 0.9 }}>
      <div className={sheet.content}>
        <div className={sheet.balance}>
          <div><span>{t('남은 토큰')}</span><strong>{wallet ? t('{n} 미로 토큰', { n: wallet.available.toLocaleString(locale) }) : t('잔액 확인 중')}</strong></div>
          <button type="button" onClick={() => { setOpen(false); openRecharge() }}>{t('토큰 충전')}</button>
        </div>
        <p className={sheet.description}>{t('모든 모델에서 토큰을 사용해요. 모델과 답변 길이에 따라 차감량이 달라져요.')}</p>
        <p className={sheet.description}>{t('생성 전 최대량을 예약하고, 실제 사용량만 차감한 뒤 남은 토큰을 돌려드려요.')}</p>
        <TransitionLink className={sheet.planLink} href="/my/subscription">{t('토큰 사용 내역')} <span aria-hidden>↗</span></TransitionLink>
        <div className={sheet.cards}>
          {choices.map(c => <button type="button" key={c.id} className={sheet.card} aria-pressed={selected?.id === c.id} onClick={() => { setModel(c.id); setOpen(false) }}>
            <span className={sheet.cardHeading}><strong>{c.name}</strong>{selected?.id === c.id && <span aria-label={t('선택됨')}>✓</span>}</span>
            <span className={sheet.cardLead}>{c.length === 'long' ? t('긴 답변 · 풍부한 장면 묘사') : t('일반 답변 · 편하게 이어가는 대화')}</span>
            <span className={sheet.badge}>{t('답변당 최대 {n}토큰 예약', { n: ceiling(c).toLocaleString(locale) })}</span>
            <span className={sheet.detail}>{t('AI 출력 한도 {n}토큰', { n: c.maxOutputTokens.toLocaleString(locale) })}</span>
          </button>)}
          {!choices.length && <p className={sheet.description}>{t('준비 중')}</p>}
        </div>
        <p className={sheet.footnote}>{t('미로 토큰은 서비스 이용 단위이며 AI가 처리하는 토큰 수와 달라요.')}</p>
      </div>
    </Sheet>
    {selected && <span className={sheet.composerQuote}>{t('최대 {n}토큰', { n: ceiling(selected).toLocaleString(locale) })}</span>}
  </div>
}
