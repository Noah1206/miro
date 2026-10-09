'use client'
import { useEffect, useRef } from 'react'
import styles from './messages.module.css'
import { CharacterPhoto } from '@/components/character-visual'
import { useTurns } from '../../chat/[sessionId]/turns'
import { subject } from '@/lib/format'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'

export type MsgItem = { id: string; role: string; kind: string; content: string; blocks: Array<Record<string, unknown>>; at?: string }

const clock = (iso: string | undefined, locale: string) => iso ? new Date(iso).toLocaleTimeString(locale, { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' }) : ''

/** 문자 스레드 — 캐릭터는 왼쪽, 나는 오른쪽, 통화 기록은 가운데 한 줄. 서술·속마음은 여기 없다. */
export function MessengerThread({ items: server, characterName, portrait }: { items: MsgItem[]; characterName: string; portrait?: string | null }) {
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const { appended, live } = useTurns()
  const known = new Set(server.map((m) => m.id))
  // 방금 보낸 턴은 시각이 없다 — 서버 목록이 갱신되면 그쪽 시각이 붙는다.
  // 오고 있는 문자(스트리밍, 10/9)는 맨 뒤에 — 보낸 말과 지금까지 도착한 말풍선. 저장되면 저장본이 그 자리를 채운다.
  const liveItems: MsgItem[] = live ? [{ id: 'live-user', role: 'user', kind: 'messenger', content: live.input, blocks: [] },
    ...(live.blocks.some((b) => b.type === 'dialogue') ? [{ id: 'live-reply', role: 'character', kind: 'messenger', content: '', blocks: live.blocks }] : [])] : []
  const items: MsgItem[] = [...server, ...appended.filter((m) => !known.has(m.id)).map((m): MsgItem => ({ ...m })), ...liveItems]
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [items.length, live?.blocks.length])
  return (
    <div role="log" aria-live="polite" aria-relevant="additions" aria-label={t('{name} 문자', { name: characterName })} className={styles.thread}>
      {items.length === 0 && <p className={styles.notice}>{t('{subject} 먼저 문자를 보내면 여기에 와요. 먼저 보내도 돼요.', { subject: subject(characterName), name: characterName })}</p>}
      {items.map((m) => {
        if (m.role === 'user') return <div key={m.id} className={styles.userRow}><span className={styles.time} style={{ alignSelf: 'flex-end', marginRight: 6 }}>{clock(m.at, locale)}</span><p className={styles.userBubble}>{m.content}</p></div>
        if (m.kind === 'call_record') return <p key={m.id} className={styles.meta} data-call-record>☏ {m.content}</p>
        if (m.kind === 'hidden') return <p key={m.id} className={styles.meta} data-hidden-message>{m.content}</p>
        const reality = m.blocks.find((b) => b.type === 'reality') as { channelLabel?: string; caption?: string | null } | undefined
        const lines = m.kind === 'photo' ? [] : m.blocks.filter((b) => b.type === 'dialogue' && typeof b.text === 'string').map((b) => String(b.text))
        const texts = lines.length ? lines : m.content.split(/\n\s*\n/).filter(Boolean)
        return (
          <div key={m.id} className={styles.row} data-reality-message>
            <span className={styles.avatar} aria-hidden>{portrait ? <CharacterPhoto src={portrait} alt="" size="avatar" sizes="32px" width={32} height={32} /> : characterName.slice(0, 1)}</span>
            <div className={styles.group}>
              {reality?.channelLabel && reality.channelLabel !== '문자' && <p className={styles.tag}>{reality.channelLabel}</p>}
              {m.kind === 'photo' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.content} alt={reality?.caption ? t('캐릭터가 보낸 사진 — {caption}', { caption: reality.caption }) : t('캐릭터가 보낸 사진')} style={{ maxWidth: '100%', borderRadius: 14 }} />
              )}
              {m.kind === 'photo' && reality?.caption ? <p className={styles.bubble}>{reality.caption}</p> : texts.map((text, i) => <p key={i} className={styles.bubble}>{text}</p>)}
            </div>
            <span className={styles.time}>{clock(m.at, locale)}</span>
          </div>
        )
      })}
      <div ref={end} aria-hidden />
    </div>
  )
}
