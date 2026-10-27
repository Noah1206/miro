'use client'
import { useEffect, useLayoutEffect, useRef } from 'react'
import styles from './messages.module.css'
import { useChatTheme, DefaultChatAvatar } from '@/components/chat-theme'
import { CharacterPhoto } from '@/components/character-visual'
import { bindChatComposerFollow } from '@/components/chat-viewport'
import { useMessenger } from './delivery'
import { subject } from '@/lib/format'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import { MessengerPhoto } from './photo'

const clock = (iso: string | undefined, locale: string) => iso ? new Date(iso).toLocaleTimeString(locale, { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' }) : ''

/** Delivered messages and actual character read receipts; no live scene turn. */
export function MessengerThread({ items: sample, characterName, portrait }: { items?: ReturnType<typeof useMessenger>['items']; characterName: string; portrait?: string | null }) {
  const { theme } = useChatTheme()
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const { items: delivered, draft, retry } = useMessenger()
  const items = sample ?? delivered
  const end = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  // 그리기 전에 맨 아래로(10/27) — useEffect 였을 때는 오래된 메시지가 한 번 보였다가 내려갔다.
  useLayoutEffect(() => {
    const thread = end.current?.parentElement
    if (items.at(-1)?.role === 'user') following.current = true
    if (thread && following.current) thread.scrollTop = thread.scrollHeight
  }, [items.length, draft?.text])
  useEffect(() => {
    const thread = end.current?.parentElement
    if (!thread) return
    let touchY = 0
    const scroll = () => { if (thread.scrollHeight - thread.scrollTop - thread.clientHeight < 8) following.current = true }
    const wheel = (event: WheelEvent) => { if (event.deltaY < 0) following.current = false }
    const touchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0 }
    const touchMove = (event: TouchEvent) => { const y = event.touches[0]?.clientY ?? touchY; if (y > touchY + 1) following.current = false; touchY = y }
    const keyDown = (event: KeyboardEvent) => { if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) following.current = false }
    const stopComposerFollow = bindChatComposerFollow(thread, () => { following.current = true; thread.scrollTop = thread.scrollHeight })
    const resize = new ResizeObserver(() => { if (following.current) thread.scrollTop = thread.scrollHeight })
    resize.observe(thread)
    thread.addEventListener('scroll', scroll, { passive: true })
    thread.addEventListener('wheel', wheel, { passive: true })
    thread.addEventListener('touchstart', touchStart, { passive: true })
    thread.addEventListener('touchmove', touchMove, { passive: true })
    thread.addEventListener('keydown', keyDown)
    return () => {
      stopComposerFollow()
      resize.disconnect()
      thread.removeEventListener('scroll', scroll)
      thread.removeEventListener('wheel', wheel)
      thread.removeEventListener('touchstart', touchStart)
      thread.removeEventListener('touchmove', touchMove)
      thread.removeEventListener('keydown', keyDown)
    }
  }, [])
  return (
    <div role="log" aria-live="polite" aria-relevant="additions" aria-label={t('{name} 문자', { name: characterName })} className={styles.thread}>
      {items.length === 0 && <p className={styles.notice}>{t('{subject} 먼저 문자를 보내면 여기에 와요. 먼저 보내도 돼요.', { subject: subject(characterName), name: characterName })}</p>}
      {items.map((m, index) => {
        const hideTime = theme === 'talk' && !!m.at && items[index + 1]?.role === m.role && items[index + 1]?.at?.slice(0,16) === m.at.slice(0,16)
        const time = hideTime ? '' : clock(m.at, locale)
        if (m.role === 'user') return <div key={m.id} className={styles.userRow} data-dm-role="user" data-delivery={m.delivery ?? 'sent'}>
          <span className={styles.receipt}>
            {m.delivery === 'failed' ? <button type="button" onClick={() => retry(m.id)} aria-label={t('다시 보내기')}>{t('다시 보내기')}</button>
              : m.delivery === 'sending' ? <span>{t('전송 중')}</span>
              : m.readAt === null ? <span aria-label={t('읽지 않음')} data-unread>1</span>
              : m.readAt ? <span aria-label={t('읽음')} data-read>{theme === 'talk' ? '' : t('읽음')}</span> : null}
            <span className={styles.time}>{time}</span>
          </span><p className={styles.userBubble}>{m.content}</p></div>
        if (m.kind === 'call_record') return <p key={m.id} className={styles.meta} data-call-record>☏ {m.content}</p>
        if (m.kind === 'hidden') return <p key={m.id} className={styles.meta} data-hidden-message>{m.content}</p>
        const reality = m.blocks.find((b) => b.type === 'reality') as { channelLabel?: string; caption?: string | null } | undefined
        const lines = m.kind === 'photo' ? [] : m.blocks.filter((b) => b.type === 'dialogue' && typeof b.text === 'string').map((b) => String(b.text))
        const texts = m.kind === 'photo' ? [] : lines.length ? lines : m.content.split(/\n\s*\n/).filter(Boolean)
        return (
          <div key={m.id} className={styles.row} data-dm-role="character" data-reality-message>
            <span className={styles.avatar} aria-hidden>{theme !== 'miro' ? <DefaultChatAvatar /> : portrait ? <CharacterPhoto src={portrait} alt="" size="avatar" sizes="32px" width={32} height={32} /> : characterName.slice(0, 1)}</span>
            <div className={styles.group}>
              {theme === 'talk' && <span className={styles.speaker}>{characterName}</span>}
              {reality?.channelLabel && reality.channelLabel !== '문자' && <p className={styles.tag}>{reality.channelLabel}</p>}
              {m.kind === 'photo' && <MessengerPhoto src={m.content} caption={reality?.caption} />}
              {m.kind === 'photo' && reality?.caption ? <p className={styles.bubble}>{reality.caption}</p> : texts.map((text, i) => <div key={i} className={styles.timedBubble}><p className={styles.bubble} data-continuation={i > 0 || undefined}>{text}</p>{i === texts.length - 1 && <span className={styles.time}>{time}</span>}</div>)}
            </div>
            {m.kind === 'photo' && <span className={styles.time}>{time}</span>}
          </div>
        )
      })}
      {!sample && draft?.text && <div className={styles.row} data-dm-role="character" data-messenger-draft aria-busy="true">
        <span className={styles.avatar} aria-hidden>{theme !== 'miro' ? <DefaultChatAvatar /> : portrait ? <CharacterPhoto src={portrait} alt="" size="avatar" sizes="32px" width={32} height={32} /> : characterName.slice(0, 1)}</span>
        <div className={styles.group}>{theme === 'talk' && <span className={styles.speaker}>{characterName}</span>}<p className={styles.bubble}>{draft.text}</p></div>
      </div>}
      <div ref={end} aria-hidden hidden />
    </div>
  )
}
