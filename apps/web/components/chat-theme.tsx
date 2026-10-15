'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChatPaletteIcon } from './chat-icons'
import { Sheet } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import styles from './chat-theme.module.css'
import { chatViewportState } from './chat-viewport'
import { CharacterPhoto } from './character-visual'

type Theme = 'miro' | 'dm-light' | 'dm' | 'talk'
const DEFAULT_THEME: Theme = 'miro'
const DEFAULT_THEME_KEY = 'miro:chat-theme:default'
const Context = createContext<{ theme: Theme; select: (theme: Theme) => void }>({ theme: DEFAULT_THEME, select: () => {} })
export const useChatTheme = () => useContext(Context)
const valid = (value: unknown): value is Theme => value === 'dm-light' || value === 'miro' || value === 'dm' || value === 'talk'

/** Visual preference only: shared by this session's scene and messenger on this device. */
export function ChatTheme({ sessionId, children }: { sessionId?: string; children: ReactNode }) {
  const key = sessionId ? `miro:chat-theme:${sessionId}` : DEFAULT_THEME_KEY
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const read = () => {
      try {
        const saved = localStorage.getItem(key), shared = localStorage.getItem(DEFAULT_THEME_KEY)
        const ownAt = Number(localStorage.getItem(`${key}:at`) ?? 0), sharedAt = Number(localStorage.getItem(`${DEFAULT_THEME_KEY}:at`) ?? 0)
        // The latest explicit choice wins: a library choice updates existing rooms;
        // a later choice inside one room only changes that room.
        setTheme(valid(saved) && ownAt >= sharedAt ? saved : valid(shared) ? shared : DEFAULT_THEME)
      } catch { setTheme(DEFAULT_THEME) }
    }
    read()
    const sync = (event: StorageEvent) => { if (event.key === null || [key, `${key}:at`, DEFAULT_THEME_KEY, `${DEFAULT_THEME_KEY}:at`].includes(event.key)) read() }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [key])
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    let baselineHeight = Math.max(window.innerHeight, viewport.height * viewport.scale)
    // iOS leaves the layout viewport tall when its keyboard covers the screen.
    // Use the visible viewport only while a text field has the keyboard open.
    const update = () => {
      const element = root.current
      if (!element) return
      const active = document.activeElement
      const focused = element.contains(active) && (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)
      if (!focused) baselineHeight = Math.max(window.innerHeight, viewport.height * viewport.scale)
      const state = chatViewportState(viewport, baselineHeight, focused)
      element.dataset.keyboard = String(state.keyboard)
      element.style.setProperty('--chat-visible-height', `${state.height}px`)
      element.style.setProperty('--chat-visible-width', `${state.width}px`)
      element.style.setProperty('--chat-visible-top', `${state.top}px`)
      element.style.setProperty('--chat-visible-left', `${state.left}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])
  const select = (next: Theme) => { setTheme(next); try { localStorage.setItem(key, next); localStorage.setItem(`${key}:at`, String(Date.now())) } catch { /* Private storage can be unavailable; selection still works. */ } }
  return <Context.Provider value={{ theme, select }}>{sessionId ? <div ref={root} className={styles.root} data-chat-theme={theme}>{children}</div> : children}</Context.Provider>
}

export function DefaultChatAvatar({ theme: previewTheme }: { theme?: Theme } = {}) {
  const { theme: currentTheme } = useChatTheme()
  const theme = previewTheme ?? currentTheme
  if (theme === 'talk') return <svg data-default-avatar aria-hidden viewBox="0 0 40 40" width="32" height="32"><path d="M20 1C7 1 1 8 1 20s6 19 19 19 19-7 19-19S33 1 20 1Z" fill="#91cddd" stroke="#88bfce" strokeWidth=".7"/><circle cx="20" cy="15.5" r="4.3" fill="#c3e6ed"/><path d="M20 21.5c-5 0-8.2 3.1-8.2 6.2v1.1h16.4v-1.1c0-3.1-3.2-6.2-8.2-6.2Z" fill="#c3e6ed"/></svg>
  if (theme === 'dm' || theme === 'dm-light') return <svg data-default-avatar aria-hidden viewBox="0 0 40 40" width="32" height="32"><circle cx="20" cy="20" r="20" fill="var(--chat-avatar-bg, #ededed)"/><circle cx="20" cy="14" r="7.5" fill="var(--chat-avatar-ink, #c7c7c7)"/><path d="M4 40v-2c0-8 7.2-13 16-13s16 5 16 13v2Z" fill="var(--chat-avatar-ink, #c7c7c7)"/></svg>
  return <svg data-default-avatar aria-hidden viewBox="0 0 40 40" width="32" height="32"><rect width="40" height="40" rx="11" fill="var(--chat-avatar-bg, #dbdbdb)" /><circle cx="20" cy="15" r="7" fill="var(--chat-avatar-ink, #a8a8a8)" /><path d="M6 36c0-9 5-13 14-13s14 4 14 13" fill="var(--chat-avatar-ink, #a8a8a8)" /></svg>
}

export function ChatThemePicker({ open: controlledOpen, onOpenChange, hideTrigger = false, placement = 'header', portrait }: { open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean; placement?: 'header' | 'composer' | 'library'; portrait?: string | null } = {}) {
  const { theme, select } = useChatTheme()
  const [localOpen, setLocalOpen] = useState(false)
  const open = controlledOpen ?? localOpen
  const setOpen = onOpenChange ?? setLocalOpen
  const t = useT()
  return <>
    {!hideTrigger && <button className={placement === 'library' ? styles.libraryTrigger : placement === 'composer' ? styles.composerTrigger : styles.trigger} type="button" aria-label={t('채팅방 디자인 라이브러리')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <ChatPaletteIcon />{placement === 'library' && <span>{t('디자인 라이브러리')}</span>}
    </button>}
    <Sheet open={open} onClose={() => setOpen(false)} title={t('채팅방 디자인 라이브러리')} snap={{ half: 0.72, full: 0.92 }}>
      <div className={styles.options}>
        {(['miro', 'dm-light', 'dm', 'talk'] as const).map(value => <button type="button" key={value} className={styles.option} aria-pressed={theme === value} onClick={() => { select(value); setOpen(false) }}>
          <span className={styles.preview} data-preview={value} aria-hidden><span className={styles.previewHead}><span className={styles.previewAvatar}>{value === 'miro' && portrait ? <CharacterPhoto src={portrait} alt="" size="avatar" sizes="20px" width={20} height={20} /> : <DefaultChatAvatar theme={value} />}</span><i /></span><span className={styles.incoming} /><span className={styles.outgoing} /></span>
          <span className={styles.label}>{t(value === 'miro' ? '미로 기본' : value === 'dm-light' ? '인스타 DM' : value === 'dm' ? '인스타 DM 다크' : '카톡 스타일')}<span aria-hidden>{theme === value ? '✓' : ''}</span></span>
        </button>)}
      </div>
    </Sheet>
  </>
}

export function ChatHeaderAvatar({ portrait }: { portrait?: string | null } = {}) {
  const { theme } = useChatTheme()
  return <span className={styles.headerAvatar} data-avatar-theme={theme} aria-hidden>
    {theme === 'miro' && portrait
      ? <CharacterPhoto key={portrait} src={portrait} alt="" size="avatar" sizes="30px" width={30} height={30} loading="eager" />
      : <DefaultChatAvatar />}
  </span>
}


/** Navigation > Chats: the selected design becomes the device's default for all rooms. */
export function ChatDesignLibrary() {
  return <ChatTheme><ChatThemePicker placement="library" /></ChatTheme>
}
