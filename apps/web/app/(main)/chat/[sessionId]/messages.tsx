'use client'
import { AnimatePresence } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import styles from './chat.module.css'
import { Popover, MenuItem, TransitionLink } from '@/components/ui'
import { Line, SceneMeta } from '@/components/scene/text'
import { Emphasis } from '@/components/scene/emphasis'
import { TypedText } from '@/components/scene/typed-text'
import type { Mood } from '@miro/domain'
import { usePress } from '@/lib/motion/use-press'
import { useTurns } from './turns'

export type Msg = { id: string; role: string; kind: string; content: string; blocks: Array<Record<string, unknown>> }

export function MessageList({ items: server, characterName, portrait, mood = 'neutral' }: {
  items: Msg[]; characterName: string; portrait?: string | null
  /** 캐릭터의 지금 기분 — 타이핑 속도가 여기서 나온다. */
  mood?: Mood
}) {
  // 서버 목록 뒤에 방금 보낸 턴을 붙인다. refresh 로 서버 목록에 같은 id 가 실리면 그쪽만 남는다.
  const { appended } = useTurns()
  const known = new Set(server.map((m) => m.id))
  const items = [...server, ...appended.filter((m) => !known.has(m.id))]
  const end = useRef<HTMLDivElement>(null)
  // 이미 화면에 있던 메시지는 다시 치지 않는다. 처음 열 때 전부 다시 치면 대화가 재생된다.
  const seen = useRef<Set<string> | null>(null)
  if (seen.current === null) seen.current = new Set(items.map((m) => m.id))
  const last = items[items.length - 1]
  // 치는 중인 메시지는 한 번 정해지면 다음 메시지가 올 때까지 바뀌지 않는다 — 백그라운드 refresh 로 목록이 갈려도 타이핑이 끊기지 않는다.
  const typing = useRef<string | null>(null)
  if (last && last.role !== 'user' && !seen.current.has(last.id)) typing.current = last.id
  else if (!last || typing.current !== last.id) typing.current = null
  const typingId = typing.current

  // 타이핑 중에는 글자가 늘어날 때마다 바닥을 따라간다.
  const follow = () => end.current?.scrollIntoView({ block: 'end' })
  useEffect(follow, [items.length])
  useEffect(() => { for (const m of items) seen.current!.add(m.id) }, [items])

  return (
    <div role="log" aria-live="polite" aria-relevant="additions" aria-label={characterName + ' 대화'} className={styles.messages}>
      <AnimatePresence initial={false}>
        {items.map((m) => (
          <Line key={m.id}>
            <Message m={m} characterName={characterName} portrait={portrait}
              typing={m.id === typingId} mood={mood} onGrow={follow} />
          </Line>
        ))}
      </AnimatePresence>
      <div ref={end} aria-hidden />
    </div>
  )
}

function Message({ m, characterName, portrait, typing = false, mood = 'neutral', onGrow }: {
  m: Msg; characterName: string; portrait?: string | null; typing?: boolean; mood?: Mood; onGrow?: () => void
}) {
  const reality = m.blocks.find((b) => b.type === 'reality') as { senderLabel?: string; channelLabel?: string; caption?: string | null } | undefined
  if (m.role === 'user') return <div className={styles.userRow}><p className={styles.userBubble}>{m.content}</p></div>
  if (m.kind === 'hidden') return <p data-hidden-message className="t-caption" style={{ fontStyle: 'italic' }}>{m.content}</p>
  if (m.kind === 'call_record') return <SceneMeta><span data-call-record>☏ {m.content}</span></SceneMeta>
  // Live Scene 장면 전환 — 장소·시간 한 줄이 조용히 지나간다. 이미지 없음, 흐름 중단 없음 (명세서 §5.3).
  if (m.kind === 'live_scene') return <SceneMeta><span data-scene-marker>— {m.content} —</span></SceneMeta>
  if (m.kind === 'photo') {
    return (
      <Reportable id={m.id} kind="photo">
        {reality && <RealityTag sender={reality.senderLabel} channel={reality.channelLabel} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.content} alt={reality?.caption ? `캐릭터가 보낸 사진 — ${reality.caption}` : '캐릭터가 보낸 사진'} style={{ maxWidth: '72%', borderRadius: 'var(--radius-md)' }} />
        {reality?.caption && <p className="t-caption t-quote">{reality.caption}</p>}
      </Reportable>
    )
  }
  if (m.kind === 'reality_message') {
    // 캐릭터가 먼저 보낸 연락 — 세계관의 표현(편지·문자·사내 메신저)을 함께. 이 순간만 관계색 한 줄.
    return (
      <Reportable id={m.id} kind="message">
        <RealityTag sender={reality?.senderLabel} channel={reality?.channelLabel} />
        <div data-reality-message style={{ paddingLeft: 12, borderLeft: '2px solid var(--color-accent)' }}>
          <CharacterBubble m={m} name={characterName} portrait={portrait} typing={typing} mood={mood} onGrow={onGrow} />
        </div>
      </Reportable>
    )
  }
  return <Reportable id={m.id} kind="message"><CharacterBubble m={m} name={characterName} portrait={portrait} typing={typing} mood={mood} onGrow={onGrow} /></Reportable>
}

function CharacterBubble({ m, name, portrait, typing = false, mood = 'neutral', onGrow }: {
  m: Msg; name: string; portrait?: string | null; typing?: boolean; mood?: Mood; onGrow?: () => void
}) {
  const blocks = m.blocks.filter(b => ['dialogue', 'action', 'narrative', 'npc', 'world'].includes(String(b.type)) && typeof b.text === 'string')
  const paragraphs = blocks.length ? blocks.map(b => ({ text: String(b.text), action: ['action', 'narrative', 'world'].includes(String(b.type)), speaker: typeof b.speaker === 'string' ? b.speaker : null }))
    : m.content.split(/\n\s*\n/).map(text => {
      const prefix = `${name}:`
      const dialogue = text.startsWith(prefix)
      return { text: dialogue ? text.slice(prefix.length).trimStart() : text, action: !dialogue && /^\*[^*]/.test(text), speaker: null }
    })
  // 문단을 하나씩 친다 — 메신저에서 여러 줄이 연달아 오는 느낌.
  const [typed, setTyped] = useState(0)

  return <div className={styles.characterRow}>
    <span className={styles.avatar} aria-hidden>{portrait ? <img src={portrait} alt="" width={32} height={32} /> : name.slice(0, 1)}</span>
    <div className={styles.characterContent}>
      <p className={styles.speaker}>{name}</p>
      <div className={styles.bubble}>
        {paragraphs.map((p, i) => (
          <p key={i} className={p.action ? styles.action : undefined} hidden={typing && i > typed}>
            {p.speaker && p.speaker !== name && `${p.speaker}: `}
            {typing && i === typed
              ? <TypedText text={p.text} mood={mood} onDone={() => { setTyped(i + 1); onGrow?.() }} />
              : <Emphasis text={p.text} />}
          </p>
        ))}
      </div>
    </div>
  </div>
}

function RealityTag({ sender, channel }: { sender?: string; channel?: string }) {
  return <p className="t-micro" style={{ color: 'var(--color-accent-text)', textTransform: 'none', letterSpacing: '0.04em' }}>{[sender, channel].filter(Boolean).join(' · ')}</p>
}

/**
 * 신고 진입점 (n30). 작은 링크는 항상 보이고, 꾹 누르면 같은 메뉴가 뜬다 —
 * 제스처만으로 접근되는 기능은 두지 않는다.
 */
function Reportable({ id, kind, children }: { id: string; kind: 'message' | 'photo'; children: React.ReactNode }) {
  const [menu, setMenu] = useState(false)
  const { handlers } = usePress({ onLongPress: () => setMenu(true) })
  const href = `/report?type=${kind}&id=${id}`
  return (
    <div {...handlers} className="stack" style={{ gap: 6, position: 'relative', touchAction: 'pan-y' }}>
      {children}
      <TransitionLink href={href} aria-label="신고" className="t-micro" style={{ alignSelf: 'flex-start', textTransform: 'none', letterSpacing: 0, minHeight: 24, display: 'inline-flex', alignItems: 'center', padding: '0 6px', marginLeft: -6 }}>신고</TransitionLink>
      <Popover open={menu} onClose={() => setMenu(false)}>
        <MenuItem type="button" onClick={() => { setMenu(false); window.location.href = href }}>이 내용 신고</MenuItem>
      </Popover>
    </div>
  )
}
