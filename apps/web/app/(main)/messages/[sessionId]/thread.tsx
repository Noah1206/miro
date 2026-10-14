'use client'
import { useEffect, useRef } from 'react'
import styles from './messages.module.css'
import { useChatTheme, DefaultChatAvatar } from '@/components/chat-theme'
import { CharacterPhoto } from '@/components/character-visual'
import { useMessenger } from './delivery'
import { subject } from '@/lib/format'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'

const clock = (iso: string | undefined, locale: string) => iso ? new Date(iso).toLocaleTimeString(locale, { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' }) : ''

/** Delivered messages and actual character read receipts; no live scene turn. */
export function MessengerThread({ items: sample, characterName, portrait }: { items?: ReturnType<typeof useMessenger>['items']; characterName: string; portrait?: string | null }) {
  const { theme } = useChatTheme()
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const { items: delivered, retry } = useMessenger()
  const items = sample ?? delivered
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [items.length])
  return (
    <div role="log" aria-live="polite" aria-relevant="additions" aria-label={t('{name} 문자', { name: characterName })} className={styles.thread}>
      {items.length === 0 && <p className={styles.notice}>{t('{subject} 먼저 문자를 보내면 여기에 와요. 먼저 보내도 돼요.', { subject: subject(characterName), name: characterName })}</p>}
      {items.map((m, index) => {
        const hideTime = theme === 'talk' && !!m.at && items[index + 1]?.role === m.role && items[index + 1]?.at?.slice(0,16) === m.at.slice(0,16)
        const time = hideTime ? '' : clock(m.at, locale)
        if (m.role === 'user') return <div key={m.id} className={styles.userRow} data-delivery={m.delivery ?? 'sent'}>
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
        const texts = lines.length ? lines : m.content.split(/\n\s*\n/).filter(Boolean)
        return (
          <div key={m.id} className={styles.row} data-reality-message>
            <span className={styles.avatar} aria-hidden>{theme !== 'miro' ? <DefaultChatAvatar /> : portrait ? <CharacterPhoto src={portrait} alt="" size="avatar" sizes="32px" width={32} height={32} /> : characterName.slice(0, 1)}</span>
            <div className={styles.group}>
              {theme === 'talk' && <span className={styles.speaker}>{characterName}</span>}
              {reality?.channelLabel && reality.channelLabel !== '문자' && <p className={styles.tag}>{reality.channelLabel}</p>}
              {m.kind === 'photo' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.content} alt={reality?.caption ? t('캐릭터가 보낸 사진 — {caption}', { caption: reality.caption }) : t('캐릭터가 보낸 사진')} style={{ maxWidth: '100%', borderRadius: 14 }} />
              )}
              {m.kind === 'photo' && reality?.caption ? <p className={styles.bubble}>{reality.caption}</p> : texts.map((text, i) => <div key={i} className={styles.timedBubble}><p className={styles.bubble} data-continuation={i > 0 || undefined}>{text}</p>{i === texts.length - 1 && <span className={styles.time}>{time}</span>}</div>)}
            </div>
            {m.kind === 'photo' && <span className={styles.time}>{time}</span>}
          </div>
        )
      })}
      <div ref={end} aria-hidden />
    </div>
  )
}
