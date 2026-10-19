'use client'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useChatTheme } from './chat-theme'
import { useT } from '@/lib/i18n/client'
import styles from './chat-input-tools.module.css'

export function ChatSendIcon() {
  const { theme } = useChatTheme()
  if (theme === 'dm' || theme === 'dm-light') return <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4.2 3.4h15.2c2.1 0 3.1 2.2 1.9 3.9L12 20.1c-1.1 1.5-3.5 1.1-4-.7l-1.4-5.2 9.2-6.1c.5-.4.1-1.2-.5-.9L5.1 12.4 2.5 9C.7 6.7 1.5 3.4 4.2 3.4Z"/></svg>
  return <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
}

export function ChatEmojiButton({ onSelect, disabled = false, textareaRef, onDraftChange }: { onSelect: (emoji: string) => void; disabled?: boolean; textareaRef?: RefObject<HTMLTextAreaElement | null>; onDraftChange?: (value: string) => void }) {
  const t = useT()
  const { theme } = useChatTheme()
  const [open,setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown',outside); document.addEventListener('keydown',escape)
    return () => { document.removeEventListener('pointerdown',outside); document.removeEventListener('keydown',escape) }
  },[open])
  if (textareaRef && onDraftChange) return <button type="button" data-coach="narration" className={`${styles.trigger} ${styles.narration}`} disabled={disabled} aria-label="상황 묘사 넣기" title="상황 묘사 넣기" onPointerDown={event=>event.preventDefault()} onClick={()=>{
    const input = textareaRef.current
    if (!input) return
    const {value, selectionStart:start, selectionEnd:end} = input
    const limit = input.maxLength > 0 ? input.maxLength : 2000
    if (value.length + 2 > limit) { input.focus(); return }
    onDraftChange(value.slice(0,start) + '*' + value.slice(start,end) + '*' + value.slice(end))
    requestAnimationFrame(()=>{ if (textareaRef.current !== input) return; input.focus(); input.setSelectionRange(start + 1,end + 1) })
  }}><svg aria-hidden width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 4v16M5.1 8l13.8 8M5.1 16l13.8-8"/></svg></button>
  return <div ref={root} className={styles.root}>
    <button ref={trigger} type="button" className={styles.trigger} disabled={disabled} aria-label={t('이모지')} aria-expanded={open} onClick={()=>setOpen(!open)}>{theme !== 'miro' ? <svg aria-hidden width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#c4d2dc"/><ellipse cx="7.3" cy="9" rx="1.25" ry="1.7" fill="#202529"/><ellipse cx="16.7" cy="9" rx="1.25" ry="1.7" fill="#202529"/><path d="m12 10.4-1 2h1.3M7.1 14.6c2.2 4.1 7.6 4.1 9.8 0" fill="none" stroke="#202529" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> : <svg aria-hidden width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 21H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9l-6 6Zm0 0v-4a2 2 0 0 1 2-2h4M8 9h.01M16 9h.01M8 13c1.5 2.5 4.5 2.5 6 0"/></svg>}</button>
    {open && <div className={styles.palette} role="group" aria-label={t('이모지')}>{['🙂','😊','😂','🥺','❤️','👍','✨','😴'].map(emoji=><button key={emoji} type="button" disabled={disabled} onClick={()=>{ onSelect(emoji); setOpen(false) }}>{emoji}</button>)}</div>}
  </div>
}

export function ChatInputMore({ onInsert, disabled = false }: { onInsert: (text: string) => void; disabled?: boolean }) {
  const { theme } = useChatTheme()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown',outside); document.addEventListener('keydown',escape)
    return () => { document.removeEventListener('pointerdown',outside); document.removeEventListener('keydown',escape) }
  }, [open])
  if (theme === 'dm' || theme === 'dm-light') return <ChatSearchButton />
  if (theme !== 'talk') return null
  return <div ref={root} className={styles.root}>
    <button ref={trigger} type="button" className={styles.more} disabled={disabled} aria-label={t('입력 도구')} aria-expanded={open} onClick={()=>{setOpen(!open);setError(false)}}><svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 4v16M4 12h16"/></svg></button>
    {open && <div className={styles.morePanel} role="group" aria-label={t('입력 도구')}>
      <button type="button" disabled={disabled} onClick={async()=>{try {const text = await navigator.clipboard.readText();onInsert(text);setOpen(false)} catch {setError(true)}}}>{t('붙여넣기')}</button>
      <button type="button" disabled={disabled} onClick={()=>{onInsert('\n');setOpen(false)}}>{t('줄바꿈')}</button>
      {error && <p role="status">{t('입력창을 길게 눌러 붙여넣어 주세요.')}</p>}
    </div>}
  </div>
}

function ChatSearchButton() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [open])
  const search = () => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return
    const scope = root.current?.closest('main')
    const matches = Array.from(scope?.querySelectorAll<HTMLElement>('[role="log"] p') ?? []).filter(el => el.textContent?.toLocaleLowerCase().includes(term))
    if (!matches.length) { setStatus('일치하는 대화가 없어요.'); return }
    matches[0]?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' })
    setStatus(`${matches.length}개의 대화를 찾았어요.`)
  }
  return <div ref={root} className={styles.root}>
    <button ref={trigger} type="button" className={styles.more} aria-label="대화 검색" aria-expanded={open} onClick={() => setOpen(!open)}><svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/></svg></button>
    {open && <div className={styles.morePanel} role="group" aria-label="대화 검색"><input autoFocus className={styles.searchInput} aria-label="대화 검색어" placeholder="대화에서 찾기" value={query} onChange={event => {setQuery(event.target.value);setStatus('')}} onKeyDown={event => {if(event.key === 'Enter') {event.preventDefault();search()}}}/><button type="button" onClick={search}>찾기</button><p role="status">{status}</p></div>}
  </div>
}
