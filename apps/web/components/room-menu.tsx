'use client'
import { useId, useState, type ReactNode } from 'react'
import type { UserPersona } from '@miro/domain'
import type { CharacterEntry } from '@/lib/character-entry'
import type { ChatModelChoice } from '@/lib/ai/chat-models'
import { ChatThemeOptions, DefaultChatAvatar } from '@/components/chat-theme'
import { CharacterPhoto } from '@/components/character-visual'
import { ConversationPersona } from '@/components/conversation-persona'
import { InstallAppButton } from '@/components/pwa-install'
import { Drawer } from '@/components/ui/drawer'
import { TransitionLink } from '@/components/ui/transition-link'
import { useWallet } from '@/components/wallet/provider'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import { useChatModel } from '@/app/(main)/chat/[sessionId]/model-picker'
import { MemoryGraphView } from '@/app/(main)/chat/[sessionId]/memory-graph'
import { useImmersive } from '@/app/(main)/chat/[sessionId]/immersive'
import styles from './room-menu.module.css'

type Panel = 'persona' | 'theme' | 'model' | 'memory'
type IconName = Panel | 'message' | 'archive' | 'character' | 'settings' | 'download' | 'exit'
function MenuIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    persona: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
    theme: <><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z"/><path d="M7 10h.01M10 6.5h.01M15 7h.01M18 10h.01" strokeWidth="3"/></>,
    model: <><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M8 12v3M16 12v3M1 12h3M20 12h3"/></>,
    memory: <><path d="M8 4h8l4 4v12H4V4h4M15 4v5h5M8 13h8M8 17h5"/></>,
    message: <path d="M21 11a8 8 0 0 1-8 8H8l-5 3v-6a8 8 0 0 1 0-10A8 8 0 0 1 9 3h4a8 8 0 0 1 8 8Z"/>,
    archive: <><path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 2"/></>,
    character: <><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="9" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></>,
    settings: <><path d="M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M9 15v6"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    exit: <><path d="M9 4h11v16H9M13 12H2m4-4-4 4 4 4"/></>,
  }
  return <svg aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
function Chevron() { return <svg aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m9 5 7 7-7 7"/></svg> }

/** Existing room controls share one drawer; detail panels expand in place. */
export function RoomMenu({ sessionId, initialPersona, characterName, entry, portrait, messengerHref, characterHref, choices = [], turnCount = 0, messenger = false }: {
  sessionId: string; initialPersona: UserPersona | null; characterName: string
  entry?: CharacterEntry | null; portrait?: string | null; messengerHref?: string; characterHref?: string
  choices?: ChatModelChoice[]; turnCount?: number; messenger?: boolean
}) {
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const { available, on, toggle } = useImmersive()
  const { wallet, openRecharge } = useWallet()
  const { model, setModel } = useChatModel()
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  const close = () => setOpen(false)
  const selected = choices.find(c => c.id === model) ?? choices.find(c => c.length === (model === 'pro' ? 'long' : 'scene'))
  const families = [...new Set(choices.map(c => c.id.replace(/:(scene|long)$/, '')))]
  const modelLabel = (c: ChatModelChoice) => `${c.length === 'long' ? 'ECHO' : 'MIRO'}${families.length > 1 ? ` ${families.indexOf(c.id.replace(/:(scene|long)$/, '')) + 1}` : ''}`
  const titles: Record<Panel, string> = { persona: t('페르소나'), model: t('대화 방식'), theme: t('채팅방 테마'), memory: t('대화 기억') }
  const tiles: Panel[] = ['persona', 'model', 'theme', 'memory']
  const archiveHref = messenger ? '/archive?channel=dm' : '/archive'
  const row = (href: string, icon: IconName, label: string) => <TransitionLink href={href} className={styles.row} onClick={close}><MenuIcon name={icon}/><span>{label}</span><Chevron/></TransitionLink>
  return <>
    <button type="button" className={styles.trigger} aria-label={t('대화 메뉴')} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => { setPanel(null); setOpen(true) }}>
      <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    <Drawer id={menuId} open={open} onClose={close} title={t('채팅방 설정')} footer={row(archiveHref, 'exit', t('대화방 나가기'))}>
      <section className={styles.account} aria-label={characterName}>
        <div className={styles.identity}><span className={styles.avatar}>{portrait ? <CharacterPhoto src={portrait} alt="" size="avatar" width={38} height={38} sizes="38px"/> : <DefaultChatAvatar/>}</span><span className={styles.identityText}><strong>{characterName}</strong></span></div>
        <div className={styles.wallet} aria-label={t('보유 토큰')}>
          <p className={styles.balance} aria-live="polite"><img src="/miro-token.svg" alt="" aria-hidden="true" width={24} height={24} decoding="async"/><strong data-room-balance={wallet?.available}>{wallet ? wallet.available.toLocaleString(locale) : '—'}</strong><span className="sr-only">{t('미로 토큰')}</span></p>
          <button type="button" onClick={() => { close(); openRecharge() }}>{t('충전하기')}</button>
        </div>
      </section>
      <section className={styles.section} aria-label={t('내 설정')}>
        <h3>{t('내 설정')}</h3>
        <div className={styles.grid}>{tiles.map(id => <button key={id} id={`${menuId}-${id}`} type="button" className={styles.tile} aria-expanded={panel === id} aria-controls={panel === id ? `${menuId}-detail` : undefined} onClick={() => setPanel(panel === id ? null : id)}>
          <MenuIcon name={id}/><span>{titles[id]}</span>
        </button>)}</div>
        {panel && <div id={`${menuId}-detail`} role="region" aria-labelledby={`${menuId}-${panel}`} className={styles.detail}>
          <div className={styles.detailHead}><strong>{titles[panel]}</strong><button type="button" aria-label={t('상세 설정 닫기')} onClick={() => { document.getElementById(`${menuId}-${panel}`)?.focus(); setPanel(null) }}>×</button></div>
          {panel === 'persona' && <ConversationPersona inline sessionId={sessionId} initial={initialPersona} characterName={characterName} entry={entry}/>}
          {panel === 'theme' && <ChatThemeOptions compact portrait={portrait}/>}
          {panel === 'memory' && <MemoryGraphView sessionId={sessionId} refreshKey={turnCount}/>}
          {panel === 'model' && <div className={styles.modelOptions}>{choices.map(choice => <button type="button" key={choice.id} aria-pressed={selected?.id === choice.id} onClick={() => setModel(choice.id)}><strong>{modelLabel(choice)}</strong><span aria-hidden="true">{selected?.id === choice.id ? '✓' : ''}</span></button>)}{!choices.length && <p>{t('준비 중')}</p>}</div>}
        </div>}
      </section>
      {available && <section className={styles.section} aria-label={t('대화 모드')}><h3>{t('대화 모드')}</h3><div className={styles.modes}>{[false, true].map(voice => <button key={String(voice)} type="button" aria-pressed={on === voice} onClick={() => { if (on !== voice) toggle() }}>{voice ? t('음성 모드') : t('채팅 모드')}</button>)}</div></section>}
      <section className={`${styles.section} ${styles.actions} ${styles.management}`} aria-label={t('대화 관리')}>
        {messengerHref && row(messengerHref, 'message', t('메시지 창으로 이동'))}
        {characterHref && row(characterHref, 'character', t('캐릭터 정보'))}
        {row(archiveHref, 'archive', t('이전 대화 보기'))}
      </section>
      <section className={`${styles.section} ${styles.actions}`} aria-label={t('환경')}>
        {row('/my/permissions', 'settings', t('알림·접근 권한'))}
        <InstallAppButton className={styles.row} onOpen={close}><MenuIcon name="download"/><span>{t('홈 화면에 추가')}</span><Chevron/></InstallAppButton>
      </section>
    </Drawer>
  </>
}
