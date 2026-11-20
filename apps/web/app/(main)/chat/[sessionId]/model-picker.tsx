'use client'
import { createContext, useContext, useEffect, useState, useRef, useId, type ReactNode } from 'react'
import { StepSlider } from '@/app/(main)/create/settings-controls'
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

/** 11/21 사용자: 모델 버튼을 누르면 먼저 보이는 추천 모델. */
const RECOMMENDED = ['Claude Sonnet 5.5', 'Gemini 3.8 Flash', 'Claude Opus 5.5', 'Claude Fable 5.2']
/** Model identity stays separate from the reply-length setting. */
const brand = Outfit({ subsets: ['latin'], weight: ['500'], display: 'swap' })

const Selection = createContext({ model: 'miro', setModel: (_model: string) => {} })
/** initialWallet 은 선택 — 대화방·문자방은 렌더를 늦추지 않으려 넘기지 않고 레이아웃이 읽은 잔액을 쓴다(10/27). */
export function ChatModelProvider({ children, initialWallet, initialModel = 'miro', storageKey, modelChoices }: { children: ReactNode; initialWallet?: WalletSnapshot; initialModel?: string; storageKey?: string; modelChoices?: string[] }) {
  const { seed } = useWallet()
  useEffect(() => { if (initialWallet) seed(initialWallet) }, [initialWallet, seed])
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
  return <span className={`${brand.className} ${sheet.current} ${className ?? ''}`} aria-label={`${t('AI 모델')}: ${presentation?.label ?? t('준비 중')}`} aria-live="polite" aria-atomic="true" data-current-chat-model={selected?.id} data-model-brand={presentation?.icon ?? 'other'}>
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
  const [more, setMore] = useState(false)
  const reduce = useReducedMotion()
  // 추천 = 정해 둔 모델들(있는 것만) + 지금 고른 모델이 거기 없으면 맨 앞에.
  const recommended = (() => {
    const picks = RECOMMENDED.flatMap(name => rows.filter(c => c.name.replace(/ · .*$/, '') === name))
    const current = rows.find(c => c.id === selected?.id)
    return current && !picks.includes(current) ? [current, ...picks] : picks.length ? picks : rows.slice(0, 4)
  })()
  return <div className={sheet.options}>
    {selected && (() => {
      const lengths = ['short', 'scene', 'plus', 'long', 'saga'] as const
      const label = (value: typeof lengths[number]) => ({ short: t('짧은 대화'), scene: t('기본 대화'), plus: t('조금 긴 대화'), long: t('긴 대화'), saga: t('아주 긴 대화') })[value]
      const pick = (value: typeof lengths[number]) => { const choice = choices.find(c => chatModelFamily(c) === chatModelFamily(selected) && c.length === value); if (choice) setModel(choice.id) }
      // 11/3: 만들기 화면의 단계 슬라이더와 같은 모양.
      return <div className={sheet.lengths}>
        <StepSlider label={t('답변 길이')} steps={lengths.map(value => ({ value, label: label(value) }))} value={length} onChange={value => pick(value as typeof lengths[number])} />
      </div>
    })()}
    {/* 11/21 사용자: 처음엔 추천 모델만, '더 많은 모델 보러가기'를 누르면 옆으로 넘어가며 전체 목록(회사별). */}
    <AnimatePresence mode="wait" initial={false} custom={more}>
      <motion.div key={more ? 'all' : 'rec'} custom={more}
        initial={reduce ? false : { opacity: 0, x: more ? 36 : -36 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: more ? -36 : 36 }}
        transition={{ duration: reduce ? 0 : .2, ease: ease.standard }}>
        {more && <button type="button" className={sheet.back} onClick={() => setMore(false)}>‹ {t('추천 모델')}</button>}
        {(more ? providers : [null]).map(provider => <section key={provider ?? 'rec'} className={sheet.group} aria-label={provider ?? t('추천 모델')}>
          <h3>{provider ?? t('추천 모델')}</h3>
          {(provider ? rows.filter(c => modelPresentation(c).provider === provider) : recommended).map(choice => {
            const presentation = modelPresentation(choice)
            return <button type="button" key={choice.id} className={sheet.option} aria-pressed={selected?.id === choice.id} onClick={() => { setModel(choice.id); onSelect?.() }}>
              {/* 11/21 사용자: 이름은 굵게, 바로 옆에 한 턴 토큰(분홍)+토큰 그림, 아래 한 줄 소개는 옅은 흰색. */}
              <span className={sheet.copy}><span className={sheet.heading} data-model-brand={presentation.icon ?? 'other'}><ModelBrandIcon brand={presentation.icon} className={sheet.icon}/><strong>{choice.name}</strong>
                {/* 11/21 기간 한정 할인 모델: 정가(줄 그음) · 할인가 · 'N% 할인'. */}
                <span className={sheet.price} aria-label={choice.listTokens ? t('보통 {typical} 토큰/턴, 정가 {list}에서 {rate}% 할인', { typical: choice.typicalTokens.toLocaleString(locale), list: choice.listTokens.toLocaleString(locale), rate: Math.round((choice.discountRate ?? 0) * 100) }) : t('보통 {typical} 토큰/턴', { typical: choice.typicalTokens.toLocaleString(locale) })}>
                  {choice.listTokens && <s className={sheet.listPrice}>{choice.listTokens.toLocaleString(locale)}</s>}{choice.typicalTokens.toLocaleString(locale)}<img src="/miro-token.svg" alt="" aria-hidden="true" width={14} height={14} decoding="async"/></span>
                {choice.listTokens && <span className={sheet.discount} aria-hidden="true">{t('{rate}% 할인', { rate: Math.round((choice.discountRate ?? 0) * 100) })}</span>}</span>
                <span className={sheet.description}>{t(presentation.description)}</span></span>
              <span className={sheet.cost}><span className={sheet.check} aria-hidden="true">{selected?.id === choice.id ? '✓' : ''}</span></span>
            </button>
          })}
        </section>)}
        {!more && rows.length > recommended.length && <button type="button" className={sheet.more} onClick={() => setMore(true)}>{t('더 많은 모델 보러가기')} ›</button>}
      </motion.div>
    </AnimatePresence>
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
    <motion.button ref={trigger} whileTap={reduce ? undefined : { scale: .95 }} transition={spring.quick} type="button" className={sheet.trigger} data-model-brand={presentation?.icon ?? 'other'} disabled={disabled} title={selected?.name} aria-label={`${t('AI 모델 선택')}${selected ? `: ${selected.name}` : ''}`} aria-haspopup="dialog" aria-controls={open ? panelId : undefined} aria-expanded={open} onClick={() => setPickerOpen(!open)}>
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
