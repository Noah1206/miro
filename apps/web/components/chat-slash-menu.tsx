'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { TransitionLink } from '@/components/ui'
import { useRoomControls } from '@/components/room-controls'
import { useWallet } from '@/components/wallet/provider'
import { searchCommands, type LibraryCommand } from '@/app/(main)/create/commands'
import { useT } from '@/lib/i18n/client'
import styles from './chat-slash-menu.module.css'

export type SelectedCommand = { name: string; sourceId?: string }
function Icon({ children }: { children: ReactNode }) {
  return <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
}
const icons = {
  library: <Icon><path d="M4 4h6v16H4zM14 4h6v16h-6zM7 7v4M17 7v4"/></Icon>,
  persona: <Icon><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></Icon>,
  model: <Icon><rect x="4" y="6" width="16" height="15" rx="3"/><path d="M12 2v4M8 11v3M16 11v3"/></Icon>,
  theme: <Icon><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4h3a4 4 0 0 0 4-4c0-5-4-10-9-10Z"/><path d="M7 10h.01M10 7h.01M15 8h.01" strokeWidth="3"/></Icon>,
  memory: <Icon><path d="M4 4h12l4 4v12H4zM14 4v6h6M8 13h8M8 17h5"/></Icon>,
  message: <Icon><path d="M21 12a8 8 0 0 1-8 8H8l-5 2v-6a8 8 0 0 1 6-13h4a8 8 0 0 1 8 9Z"/></Icon>,
  wallet: <Icon><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18M16 14h2"/></Icon>,
}

/** The slash palette exposes existing room controls and selectable server-owned commands. */
export function ChatSlashMenu({ commands, messengerHref, disabled, onPick }: {
  commands: Array<{ name: string; hint: string }>; messengerHref?: string
  disabled: boolean; onPick: (command: SelectedCommand) => void
}) {
  const t = useT()
  const { openRoomPanel, setPickerOpen } = useRoomControls()
  const { openRecharge } = useWallet()
  const [open, setOpen] = useState(false)
  const [library, setLibrary] = useState(false)
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<LibraryCommand[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  useEffect(() => {
    if (!open || !library) return
    let active = true
    setRows(null); setFailed(false)
    const timer = setTimeout(() => {
      void searchCommands(query).then(result => { if (active) setRows(result) }).catch(() => { if (active) setFailed(true) })
    }, 180)
    return () => { active = false; clearTimeout(timer) }
  }, [open, library, query, retry])
  const act = (run: () => void) => { setOpen(false); run() }
  const pick = (command: SelectedCommand) => act(() => onPick(command))
  const row = (icon: ReactNode, name: string, description: string, run: () => void) => <button type="button" role="menuitem" className={styles.row} onClick={() => act(run)}>
    {icon}<span className={styles.name}>{name}</span><span className={styles.description}>{description}</span>
  </button>
  return <div ref={root} className={styles.root}>
    <button ref={trigger} type="button" disabled={disabled} className={styles.trigger} aria-label={t('대화 기능')} aria-haspopup="menu" aria-expanded={open}
      onClick={() => { setLibrary(false); setOpen(value => !value) }}>
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m15 4-6 16"/></svg>
    </button>
    {open && <div ref={panel} className={styles.panel} role="menu" aria-label={t(library ? '명령어 라이브러리' : '대화 기능')}
      onKeyDown={event => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault()
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || event.target instanceof HTMLInputElement) return
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
        const index = items.indexOf(document.activeElement as HTMLElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
        event.preventDefault(); items[next]?.focus()
      }}>
      {library ? <>
        <div className={styles.search}>
          <button type="button" aria-label={t('뒤로')} onClick={() => setLibrary(false)}>‹</button>
          <input aria-label={t('명령어 찾기')} placeholder={t('이름이나 설명으로 찾기')} maxLength={40} value={query} onChange={event => setQuery(event.target.value)} />
        </div>
        {failed ? <button type="button" role="menuitem" className={styles.row} onClick={() => setRetry(value => value + 1)}>{t('다시 불러오기')}</button>
          : rows === null ? <p className={styles.status}>{t('불러오는 중…')}</p>
          : rows.length === 0 ? <p className={styles.status}>{t('명령어가 없어요.')}</p>
          : rows.map(command => <button key={command.id} type="button" role="menuitem" className={styles.row} onClick={() => pick({ name: command.name, sourceId: command.id })}>
            {icons.library}<span className={styles.name}>/{command.name}</span><span className={styles.description}>{command.hint || command.prompt}</span>
          </button>)}
      </> : <>
        {row(icons.library, t('라이브러리'), t('명령어를 찾아 대화에 적용'), () => { setLibrary(true); setOpen(true) })}
        {row(icons.persona, t('페르소나'), t('대화에서 사용할 내 정보'), () => openRoomPanel('persona'))}
        {row(icons.model, t('AI 모델'), t('사용할 모델과 답변 길이 선택'), () => setPickerOpen(true))}
        {row(icons.theme, t('채팅방 테마'), t('채팅방 화면과 색상 변경'), () => openRoomPanel('theme'))}
        {row(icons.memory, t('대화 기억'), t('이 대화의 기억 확인'), () => openRoomPanel('memory'))}
        {messengerHref && <TransitionLink href={messengerHref} role="menuitem" className={styles.row} onClick={() => setOpen(false)}>{icons.message}<span className={styles.name}>{t('문자방')}</span><span className={styles.description}>{t('캐릭터와 문자로 대화')}</span></TransitionLink>}
        {row(icons.wallet, t('충전하기'), t('보유 토큰 확인 및 충전'), openRecharge)}
        {commands.length > 0 && <div className={styles.commands}>{commands.map(command => <button key={command.name} type="button" role="menuitem" className={styles.row} onClick={() => pick({ name: command.name })}>
          <span className={styles.slash} aria-hidden>/</span><span className={styles.name}>/{command.name}</span><span className={styles.description}>{command.hint}</span>
        </button>)}</div>}
      </>}
    </div>}
  </div>
}
