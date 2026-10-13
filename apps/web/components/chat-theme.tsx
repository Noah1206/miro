'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Sheet } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import styles from './chat-theme.module.css'

type Theme = 'miro' | 'dm-light' | 'dm' | 'talk'
const Context = createContext<{ theme: Theme; select: (theme: Theme) => void }>({ theme: 'miro', select: () => {} })
export const useChatTheme = () => useContext(Context)
const valid = (value: unknown): value is Theme => value === 'dm-light' || value === 'miro' || value === 'dm' || value === 'talk'

/** Visual preference only: shared by this session's scene and messenger on this device. */
export function ChatTheme({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const key = `miro:chat-theme:${sessionId}`
  const [theme, setTheme] = useState<Theme>('dm-light')
  useEffect(() => {
    const read = () => { try { const saved = localStorage.getItem(key); setTheme(valid(saved) ? saved : 'dm-light') } catch { setTheme('dm-light') } }
    read()
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) read() }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [key])
  const select = (next: Theme) => { setTheme(next); try { localStorage.setItem(key, next) } catch { /* Private storage can be unavailable; selection still works. */ } }
  return <Context.Provider value={{ theme, select }}><div className={styles.root} data-chat-theme={theme}>{children}</div></Context.Provider>
}

export function DefaultChatAvatar() {
  const { theme } = useChatTheme()
  if (theme === 'talk') return <svg data-default-avatar aria-hidden viewBox="0 0 40 40" width="32" height="32"><path d="M20 1C7 1 1 8 1 20s6 19 19 19 19-7 19-19S33 1 20 1Z" fill="#91cddd" stroke="#88bfce" strokeWidth=".7"/><circle cx="20" cy="15.5" r="4.3" fill="#c3e6ed"/><path d="M20 21.5c-5 0-8.2 3.1-8.2 6.2v1.1h16.4v-1.1c0-3.1-3.2-6.2-8.2-6.2Z" fill="#c3e6ed"/></svg>
  if (theme === 'dm' || theme === 'dm-light') return <svg data-default-avatar aria-hidden viewBox="0 0 40 40" width="32" height="32"><circle cx="20" cy="20" r="20" fill="var(--chat-avatar-bg, #ededed)"/><circle cx="20" cy="14" r="7.5" fill="var(--chat-avatar-ink, #c7c7c7)"/><path d="M4 40v-2c0-8 7.2-13 16-13s16 5 16 13v2Z" fill="var(--chat-avatar-ink, #c7c7c7)"/></svg>
  return <svg data-default-avatar aria-hidden viewBox="0 0 40 40" width="32" height="32"><rect width="40" height="40" rx="11" fill="var(--chat-avatar-bg, #dbdbdb)" /><circle cx="20" cy="15" r="7" fill="var(--chat-avatar-ink, #a8a8a8)" /><path d="M6 36c0-9 5-13 14-13s14 4 14 13" fill="var(--chat-avatar-ink, #a8a8a8)" /></svg>
}

export function ChatThemePicker() {
  const { theme, select } = useChatTheme()
  const [open, setOpen] = useState(false)
  const t = useT()
  return <>
    <button className={styles.trigger} type="button" aria-label={t('채팅방 테마')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.6-3.2 1.5 1.5 0 0 1 1.2-2.4H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="11" cy="6.8" r=".8"/><circle cx="16" cy="8" r=".8"/></svg>
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title={t('채팅방 테마')}>
      <div className={styles.options}>
        {(['dm-light', 'dm', 'talk', 'miro'] as const).map(value => <button type="button" key={value} className={styles.option} aria-pressed={theme === value} onClick={() => { select(value); setOpen(false) }}>
          <span className={styles.preview} data-preview={value} aria-hidden><span className={styles.previewHead}><DefaultChatAvatar /><i /></span><span className={styles.incoming}>지금 뭐 해?</span><span className={styles.outgoing}>네 생각</span><span className={styles.previewInput} /></span>
          <span className={styles.label}>{t(value === 'miro' ? '미로 기본' : value === 'dm-light' ? 'DM 기본' : value === 'dm' ? 'DM 다크' : '카톡 스타일')}<span aria-hidden>{theme === value ? '✓' : ''}</span></span>
        </button>)}
      </div>
    </Sheet>
  </>
}

export function ChatHeaderAvatar() {
  const { theme } = useChatTheme()
  return theme === 'miro' ? null : <span className={styles.headerAvatar} data-avatar-theme={theme}><DefaultChatAvatar /></span>
}
