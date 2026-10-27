'use client'
import { createContext, useContext, useEffect, useState, useRef, useId, type ReactNode } from 'react'
import type { ChatModelChoice } from '@/lib/ai/chat-models'
import type { WalletSnapshot } from '@/lib/wallet/types'
import { useWallet } from '@/components/wallet/provider'
import sheet from './model-picker.module.css'
import { useT, useLanguage } from '@/lib/i18n/client'
import { INTL_LOCALE } from '@/lib/i18n'
import { useFocusTrap } from '@/lib/motion/use-focus-trap'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ease, spring } from '@/lib/motion/tokens'
import { Outfit } from 'next/font/google'
import { RoomControlsProvider, useRoomControls } from '@/components/room-controls'
import { ModelBrandIcon } from '@/components/model-brand-icon'
import { chatModelFamily, modelPresentation, selectedChatChoice } from '@/lib/ai/model-presentation'

/** Model identity stays separate from the reply-length setting. */
const brand = Outfit({ subsets: ['latin'], weight: ['500'], display: 'swap' })

const Selection = createContext({ model: 'miro', setModel: (_model: string) => {} })
export function ChatModelProvider({ children, initialWallet, initialModel = 'miro', storageKey, modelChoices }: { children: ReactNode; initialWallet: WalletSnapshot; initialModel?: string; storageKey?: string; modelChoices?: string[] }) {
  const { seed } = useWallet()
  useEffect(() => { seed(initialWallet) }, [initialWallet, seed])
  const [model, setModel] = useState(initialModel)
  useEffect(() => {
    if (!storageKey) return
    try { const saved = localStorage.getItem(storageKey); if (saved && modelChoices?.includes(saved)) setModel(saved) }
    catch { /* The current selection still works if device storage is unavailable. */ }
  }, [storageKey, modelChoices])
  const select = (value: string) => {
    setModel(value)
    if (storageKey) try { localStorage.setItem(storageKey, value) } catch { /* Keep the in-memory choice. */ }
  }
  return <RoomControlsProvider><Selection.Provider value={{ model, setModel: select }}>{children}</Selection.Provider></RoomControlsProvider>
}
export const useChatModel = () => useContext(Selection)
/** Shared selected-model identity for DM headers and the composer. */
export function CurrentChatModel({ choices, className }: { choices: ChatModelChoice[]; className?: string }) {
  const t = useT()
  const { model } = useChatModel()
  const selected = selectedChatChoice(choices, model)
  const presentation = selected ? modelPresentation(selected) : null
  return <span className={`${brand.className} ${sheet.current} ${className ?? ''}`} aria-label={`${t('AI 모델')}: ${presentation?.label ?? t('준비 중')}`} aria-live="polite" aria-atomic="true" data-current-chat-model={selected?.id}>
    {presentation && <ModelBrandIcon brand={presentation.icon} className={sheet.icon}/>}{presentation?.label ?? t('준비 중')}
  </span>
}

/** The drawer and popover show the same ready models and server-calculated ceilings. */
export function ChatModelOptions({ choices, onSelect }: { choices: ChatModelChoice[]; onSelect?: () => void }) {
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const { model, setModel } = useChatModel()
  const selected = selectedChatChoice(choices, model)
  const length = selected?.length ?? 'scene'
  const families = [...new Set(choices.map(chatModelFamily))]
  const rows = families.map(family => choices.find(c => chatModelFamily(c) === family && c.length === length) ?? choices.find(c => chatModelFamily(c) === family)!)
  const providers = [...new Set(rows.map(c => modelPresentation(c).provider))]
  return <div className={sheet.options}>
    {selected && <div className={sheet.lengths} role="group" aria-label={t('답변 길이')}>
      {(['scene', 'long'] as const).map(value => {
        const choice = choices.find(c => chatModelFamily(c) === chatModelFamily(selected) && c.length === value)
        return <button key={value} type="button" disabled={!choice} aria-pressed={length === value} onClick={() => { if (choice) setModel(choice.id) }}>{value === 'scene' ? t('기본 대화') : t('긴 대화')}</button>
      })}
    </div>}
    {providers.map(provider => <section key={provider} className={sheet.group} aria-label={provider}>
      <h3>{provider}</h3>
      {rows.filter(c => modelPresentation(c).provider === provider).map(choice => {
        const presentation = modelPresentation(choice)
        return <button type="button" key={choice.id} className={sheet.option} aria-pressed={selected?.id === choice.id} onClick={() => { setModel(choice.id); onSelect?.() }}>
          <span className={sheet.copy}><span className={sheet.heading}><ModelBrandIcon brand={presentation.icon} className={sheet.icon}/><strong>{choice.name}</strong></span><span className={sheet.description}>{t(presentation.description)}</span></span>
          <span className={sheet.cost}>{t('최대 {count} 토큰/턴', { count: choice.maximumTokens.toLocaleString(locale) })}<span className={sheet.check} aria-hidden="true">{selected?.id === choice.id ? '✓' : ''}</span></span>
        </button>
      })}
    </section>)}
    {!choices.length && <p className={sheet.description}>{t('준비 중')}</p>}
    {choices.length > 0 && <p className={sheet.priceNote}>{t('실제 사용량만큼 차감돼요.')}</p>}
  </div>
}

export function ModelPicker({ choices = [], place, disabled = false }: { freeReady: boolean; proReady: boolean; choices?: ChatModelChoice[]; place?: 'up'; disabled?: boolean }) {
  const t = useT()
  const reduce = useReducedMotion()
  const locale = INTL_LOCALE[useLanguage()]
  const { model } = useChatModel()
  const { wallet, openRecharge } = useWallet()
  const { pickerOpen: open, setPickerOpen } = useRoomControls()
  const selected = selectedChatChoice(choices, model)
  const presentation = selected ? modelPresentation(selected) : null
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  useFocusTrap(panel, open)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setPickerOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPickerOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open, setPickerOpen])
  return <div ref={root} className={sheet.root} data-place={place} data-coach="model">
    <motion.button ref={trigger} whileTap={reduce ? undefined : { scale: .95 }} transition={spring.quick} type="button" className={sheet.trigger} disabled={disabled} title={selected?.name} aria-label={`${t('AI 모델 선택')}${selected ? `: ${selected.name}` : ''}`} aria-haspopup="dialog" aria-controls={open ? panelId : undefined} aria-expanded={open} onClick={() => setPickerOpen(!open)}>
      {presentation && <ModelBrandIcon brand={presentation.icon} className={sheet.icon}/>}<span className={`${brand.className} ${sheet.brand}`}>{presentation?.label ?? t('준비 중')}</span>
      <motion.svg animate={{ rotate: open ? 180 : 0 }} transition={{ duration: reduce ? 0 : .18, ease: ease.standard }} aria-hidden width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></motion.svg>
    </motion.button>
    <AnimatePresence>{open && <motion.div ref={panel} id={panelId} role="dialog" aria-label={t('AI 모델 선택')} tabIndex={-1} className={sheet.panel}
      initial={reduce ? false : { opacity: 0, y: place === 'up' ? 6 : -6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reduce ? 0 : place === 'up' ? 4 : -4 }} transition={{ duration: reduce ? 0 : .18, ease: ease.enter }}>
      <div className={sheet.panelHead}>{t('AI 모델')}</div>
      <ChatModelOptions choices={choices} onSelect={() => setPickerOpen(false)}/>
      <div className={sheet.wallet}><span>{t('남은 토큰')} <strong>{wallet ? wallet.available.toLocaleString(locale) : '—'}</strong></span><button type="button" onClick={() => { setPickerOpen(false); openRecharge() }}>{t('충전')} ＋</button></div>
    </motion.div>}</AnimatePresence>
  </div>
}
