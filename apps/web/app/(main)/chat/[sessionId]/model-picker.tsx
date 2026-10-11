'use client'
import { createContext, useContext, useEffect, useState, useRef, useId, type ReactNode } from 'react'
import { TransitionLink } from '@/components/ui'
import type { ChatModelChoice } from '@/lib/ai/chat-models'
import type { WalletSnapshot } from '@/lib/wallet/types'
import { useWallet } from '@/components/wallet/provider'
import sheet from './model-picker.module.css'
import { useT, useLanguage } from '@/lib/i18n/client'
import { INTL_LOCALE } from '@/lib/i18n'
import { useFocusTrap } from '@/lib/motion/use-focus-trap'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ease, spring } from '@/lib/motion/tokens'

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
  const reduce = useReducedMotion()
  const locale = INTL_LOCALE[useLanguage()]
  const { model, setModel } = useChatModel()
  const { wallet, openRecharge } = useWallet()
  const [open, setOpen] = useState(false)
  const selected = choices.find(c => c.id === model) ?? choices.find(c => c.length === (model === 'pro' ? 'long' : 'scene'))
  const [interacted, setInteracted] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const panelId = useId()
  useFocusTrap(panel, open)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  // Retain every configured model ID; product labels hide provider names.
  const families = [...new Set(choices.map(c => c.id.replace(/:(scene|long)$/, '')))]
  const label = (c: ChatModelChoice) => {
    const name = c.length === 'long' ? t('에코') : t('미로')
    return families.length <= 1 ? name : `${name} ${families.indexOf(c.id.replace(/:(scene|long)$/, '')) + 1}`
  }
  const icon = (long: boolean) => long ? '/icons/chat/echo-hexagon-3d.png' : '/icons/chat/miro-knot-3d.png'
  return <div ref={root} className={sheet.root}>
    <motion.button whileTap={reduce ? undefined : { scale: .95 }} transition={spring.quick} type="button" tabIndex={0} className={sheet.trigger} aria-label={t('대화 방식 선택')} aria-haspopup="dialog" aria-controls={panelId} aria-expanded={open} onClick={() => setOpen(!open)}>
      <img className={sheet.icon} src={icon(selected?.length === 'long')} alt="" aria-hidden width={18} height={18} />
      {selected ? label(selected) : t('미로')}
      <motion.svg animate={{ rotate: open ? 180 : 0 }} transition={{ duration: reduce ? 0 : .24, ease: ease.standard }} aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></motion.svg>
    </motion.button>
    <AnimatePresence>
    {open && <motion.div ref={panel} id={panelId} role="dialog" aria-label={t('대화 방식 선택')} tabIndex={-1} className={sheet.panel} data-interacted={interacted}
      initial={reduce ? false : { opacity: 0, y: 12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reduce ? 0 : 8, scale: reduce ? 1 : .98 }} transition={{ duration: reduce ? 0 : .24, ease: ease.enter }} style={{ transformOrigin: 'bottom left' }}>
      <div className={sheet.options}>
        {choices.map(c => <motion.button whileTap={reduce ? undefined : { scale: .98 }} transition={spring.quick} type="button" key={c.id} className={sheet.option} aria-pressed={selected?.id === c.id} onClick={() => { setInteracted(true); setModel(c.id); setOpen(false) }}>
          <span className={sheet.heading}><img className={sheet.icon} src={icon(c.length === 'long')} alt="" aria-hidden width={18} height={18} /><strong>{label(c)}</strong><small>{c.length === 'long' ? t('긴 대화') : t('기본 대화')}</small></span>
          <span className={sheet.description}>{c.length === 'long' ? t('묘사를 더해 길게 이어가는 대화') : t('간결하게 주고받는 대화')}</span>
        </motion.button>)}
        {!choices.length && <p className={sheet.description}>{t('준비 중')}</p>}
      </div>
      <div className={sheet.wallet}>
        <span>{t('남은 토큰')} <strong>{wallet ? wallet.available.toLocaleString(locale) : '—'}</strong></span>
        <div className={sheet.actions}>
          <TransitionLink href="/my/subscription" onClick={() => setOpen(false)}>{t('내역')}</TransitionLink>
          <button type="button" onClick={() => { setOpen(false); openRecharge() }}>{t('충전')} <span aria-hidden>＋</span></button>
        </div>
      </div>
    </motion.div>}
    </AnimatePresence>
  </div>
}
