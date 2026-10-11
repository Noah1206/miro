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
export function ModelPicker({ choices = [] }: { freeReady: boolean; proReady: boolean; choices?: ChatModelChoice[] }) {
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const { model, setModel } = useChatModel()
  const { wallet, openRecharge } = useWallet()
  const [open, setOpen] = useState(false)
  const selected = choices.find(c => c.id === model) ?? choices.find(c => c.length === (model === 'pro' ? 'long' : 'scene'))
  const ceiling = (c: ChatModelChoice) => wallet ? Math.min(c.maximumTokens, wallet.available) : c.maximumTokens
  // Keep all configured choices selectable without exposing provider model names.
  const families = [...new Set(choices.map(c => c.id.replace(/:(scene|long)$/, '')))]
  const label = (c: ChatModelChoice) => {
    const name = c.length === 'long' ? t('긴 대화') : t('대화')
    if (families.length <= 1) return name
    return `${name} ${families.indexOf(c.id.replace(/:(scene|long)$/, '')) + 1}`
  }
  return <div className={styles.stylePicker}>
    <button type="button" className={styles.styleButton} aria-label={t('대화 방식 선택')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
      {selected ? label(selected) : t('대화 방식')}
      <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title={t('대화 방식')} snap={{ half: 0.45, full: 0.8 }}>
      <div className={sheet.content}>
        <div className={sheet.balance}>
          <span>{t('남은 토큰')} <strong>{wallet ? wallet.available.toLocaleString(locale) : '—'}</strong></span>
          <button type="button" onClick={() => { setOpen(false); openRecharge() }}>{t('충전')} <span aria-hidden>＋</span></button>
        </div>
        <div className={sheet.cards}>
          {choices.map(c => <button type="button" key={c.id} className={sheet.card} aria-pressed={selected?.id === c.id} onClick={() => { setModel(c.id); setOpen(false) }}>
            <span className={sheet.modeIcon} aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a8 8 0 0 1 16-5" />
                {c.length === 'long' ? <><path d="m15 3 6 6M21 3l-6 6" /><path d="M7 11h6M7 15h9" /></> : <path d="M7 11h9M7 15h5" />}
              </svg>
            </span>
            <span className={sheet.cardHeading}><strong>{label(c)}</strong><span>{c.length === 'long' ? t('장면을 길게') : t('편하게 이어가기')}</span></span>
            <span className={sheet.badge}>{t('최대 {n}토큰', { n: ceiling(c).toLocaleString(locale) })}</span>
            <span className={sheet.check} aria-hidden>{selected?.id === c.id && <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 3 3 7-7" /></svg>}</span>
          </button>)}
          {!choices.length && <p className={sheet.description}>{t('준비 중')}</p>}
        </div>
        <div className={sheet.footer}>
          <details className={sheet.help}>
            <summary>{t('토큰 안내')} <span aria-hidden>⌄</span></summary>
            <div className={sheet.helpBody}>
              <p>{t('생성 전 최대량을 예약하고, 실제 사용량만 차감한 뒤 남은 토큰을 돌려드려요.')}</p>
              <p>{t('미로 토큰은 서비스 이용 단위이며 AI가 처리하는 토큰 수와 달라요.')}</p>
            </div>
          </details>
          <TransitionLink className={sheet.planLink} href="/my/subscription">{t('사용 내역')} <span aria-hidden>↗</span></TransitionLink>
        </div>
      </div>
    </Sheet>
    {selected && <span className={sheet.composerQuote}>{t('최대 {n}토큰', { n: ceiling(selected).toLocaleString(locale) })}</span>}
  </div>
}
