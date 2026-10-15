'use client'
import { useChatTheme, DefaultChatAvatar } from '@/components/chat-theme'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ease } from '@/lib/motion/tokens'
import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './chat.module.css'
import { Popover, MenuItem } from '@/components/ui'
import { Line, SceneMeta } from '@/components/scene/text'
import { Emphasis } from '@/components/scene/emphasis'
import { TypedText } from '@/components/scene/typed-text'
import { OPENING_PARAGRAPH_MS, replyPace } from '@/components/scene/typing'
import { CharacterPhoto } from '@/components/character-visual'
import type { Mood } from '@miro/domain'
import { usePress } from '@/lib/motion/use-press'
import { useTurns } from './turns'
import { segmentReply, type Paragraph } from './reply-segments'
import { useT } from '@/lib/i18n/client'
import { useOpeningPlayback } from './use-opening-playback'

export type Msg = { at?: string; hideTime?: boolean; opening?: boolean; id: string; role: string; kind: string; content: string; blocks: Array<Record<string, unknown>> }

export function MessageList({ items: server, characterName, portrait, mood = 'neutral', sessionId, hasStarted = false }: {
  items: Msg[]; characterName: string; portrait?: string | null
  sessionId?: string; hasStarted?: boolean
  /** 캐릭터의 지금 기분 — 타이핑 속도가 여기서 나온다. */
  mood?: Mood
}) {
  // 서버 목록 뒤에 방금 보낸 턴을 붙인다. refresh 로 서버 목록에 같은 id 가 실리면 그쪽만 남는다.
  const t = useT()
  const reduce = useReducedMotion()
  const { appended, quiet, live } = useTurns()
  const known = new Set(server.map((m) => m.id))
  // 오고 있는 답(스트리밍)은 맨 뒤에 — 보낸 말과 지금까지 받은 블록. 저장된 답이 오면 사라지고 그 자리를 저장본이 채운다.
  const liveItems: Msg[] = live ? [{ id: 'live-user', role: 'user', kind: 'text', content: live.input, blocks: [] },
    ...(live.blocks.length ? [{ id: 'live-reply', role: 'character', kind: 'text', content: '', blocks: live.blocks }] : [])] : []
  const settled = [...server, ...appended.filter((m) => !known.has(m.id))]
  const items = [...settled, ...liveItems]
  const opening = useOpeningPlayback(sessionId, items, hasStarted)
  const displayed = settled.filter(opening.visible)
  const end = useRef<HTMLDivElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const wasStreaming = useRef(false)
  // 이미 화면에 있던 메시지는 다시 치지 않는다. 처음 열 때 전부 다시 치면 대화가 재생된다.
  const seen = useRef<Set<string> | null>(null)
  if (seen.current === null) seen.current = new Set(items.map((m) => m.id))
  // 스트리밍으로 이미 본 답은 저장본으로 바뀌어도 다시 치지 않는다. 오는 중인 답은 블록이 생기는 대로 그대로 보인다.
  for (const id of [...quiet, 'live-reply']) seen.current.add(id)
  const last = items[items.length - 1]
  // 치는 중인 메시지는 한 번 정해지면 다음 메시지가 올 때까지 바뀌지 않는다 — 백그라운드 refresh 로 목록이 갈려도 타이핑이 끊기지 않는다.
  const typing = useRef<string | null>(null)
  if (last && last.role !== 'user' && !seen.current.has(last.id)) typing.current = last.id
  else if (!last || typing.current !== last.id) typing.current = null
  const typingId = typing.current

  // 타이핑 중에는 글자가 늘어날 때마다 바닥을 따라간다.
  const follow = useCallback(() => { if (following.current) end.current?.scrollIntoView({ block: 'end' }) }, [])
  useEffect(() => {
    if (last?.role === 'user' || (live && !wasStreaming.current)) following.current = true
    wasStreaming.current = !!live
    follow()
  }, [items.length, displayed.length, !!live, live?.blocks.length, follow])
  useEffect(() => { for (const m of items) seen.current!.add(m.id) }, [items])
  useEffect(() => {
    const transcript = end.current?.parentElement
    if (!transcript) return
    let previousTop = transcript.scrollTop
    let touchY = 0
    let draggingScrollbar = false
    const onScroll = () => {
      const top = transcript.scrollTop
      const atBottom = transcript.scrollHeight - top - transcript.clientHeight < 8
      if (atBottom) following.current = true
      else if (draggingScrollbar && top < previousTop - 1) following.current = false
      previousTop = top
    }
    // Scroll events also come from new text, browser anchoring and a shrinking composer.
    // Pause only for the user's wheel, swipe, navigation key or scrollbar gesture.
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) following.current = false }
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0 }
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchY
      if (y > touchY + 1) following.current = false
      touchY = y
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) following.current = false
    }
    const onPointerDown = (event: PointerEvent) => { draggingScrollbar = event.target === transcript }
    const onPointerUp = () => { draggingScrollbar = false }
    // Observe the growing text itself: the scroll viewport keeps the same height while lines arrive.
    const resize = new ResizeObserver(follow)
    transcript.addEventListener('scroll', onScroll, { passive: true })
    transcript.addEventListener('wheel', onWheel, { passive: true })
    transcript.addEventListener('touchstart', onTouchStart, { passive: true })
    transcript.addEventListener('touchmove', onTouchMove, { passive: true })
    transcript.addEventListener('keydown', onKeyDown)
    transcript.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointerup', onPointerUp, { passive: true })
    window.addEventListener('pointercancel', onPointerUp, { passive: true })
    resize.observe(transcript)
    if (log.current) resize.observe(log.current)
    return () => {
      resize.disconnect()
      transcript.removeEventListener('scroll', onScroll)
      transcript.removeEventListener('wheel', onWheel)
      transcript.removeEventListener('touchstart', onTouchStart)
      transcript.removeEventListener('touchmove', onTouchMove)
      transcript.removeEventListener('keydown', onKeyDown)
      transcript.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [follow])

  return (
    <>
    <div ref={log} role="log" aria-live={opening.playing ? 'off' : 'polite'} aria-relevant="additions" aria-label={t('{name} 대화', { name: characterName })} className={styles.messages}
      data-opening-playing={opening.playing || undefined} onClick={opening.playing ? event => {
        if (!(event.target as Element).closest('button, a')) opening.finish()
      } : undefined}>
      <AnimatePresence initial={false}>
        {displayed.map((m, index) => (
          <Line key={m.id} {...(quiet.has(m.id) ? { initial: false } : {})}>
            <Message m={{...m, hideTime: !!m.at && displayed[index + 1]?.role === m.role && displayed[index + 1]?.at?.slice(0,16) === m.at.slice(0,16)}} characterName={characterName} portrait={portrait}
              typing={m.id === opening.activeId || m.id === typingId} mood={mood} onGrow={follow} onDone={() => opening.advance(m.id)} />
          </Line>
        ))}
      </AnimatePresence>
      {/* 오고 있는 답은 사라질 때 애니메이션 없이 — 저장본과 잠깐 겹쳐 두 번 보이지 않게. */}
      {liveItems.map((m) => <motion.div key={m.id}
        initial={reduce || m.role !== 'user' ? false : { opacity: 0, y: 18, scale: .98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reduce ? 0 : .32, ease: ease.enter }} style={{ transformOrigin: 'bottom right' }}>
        <Message m={m} characterName={characterName} portrait={portrait} mood={mood} onGrow={follow} />
      </motion.div>)}
    </div>
    {opening.playing && <button type="button" className={styles.openingSkip} onClick={opening.finish}>{t('인트로 전체 보기')}</button>}
    <div ref={end} aria-hidden />
    </>
  )
}

function Message({ m, characterName, portrait, typing = false, mood = 'neutral', onGrow, onDone }: {
  m: Msg; characterName: string; portrait?: string | null; typing?: boolean; mood?: Mood; onGrow?: () => void; onDone?: () => void
}) {
  const t = useT()
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => { if (typing && m.kind !== 'text') done.current?.() }, [typing, m.kind])
  // 인트로의 상황 서술(role narrator)은 블록 없이 글만 저장된다 — 캐릭터 말풍선이 아니라 장면 서술로 그린다(10/5).
  if (m.role === 'narrator' && m.kind === 'text' && !m.blocks.length) m = { ...m, blocks: [{ type: 'narrative', text: m.content }] }
  const reality = m.blocks.find((b) => b.type === 'reality') as { senderLabel?: string; channelLabel?: string; caption?: string | null } | undefined
  if (m.role === 'user') return <div className={styles.userRow}><BubbleTime m={m}/><p className={styles.userBubble}><Emphasis text={m.content} /></p></div>
  if (m.kind === 'hidden') return <p data-hidden-message className="t-caption" style={{ fontStyle: 'italic' }}>{m.content}</p>
  if (m.kind === 'call_record') return <SceneMeta><span data-call-record>☏ {m.content}</span></SceneMeta>
  if (m.kind === 'live_scene' && m.blocks.some(b => b.type === 'story_date')) return <div className={styles.storyDateMarker} data-story-date-marker><span>{m.content}</span></div>
  // Live Scene 장면 전환 — 장소·시간 한 줄이 조용히 지나간다. 이미지 없음, 흐름 중단 없음 (명세서 §5.3).
  if (m.kind === 'live_scene') return <SceneMeta><span data-scene-marker>— {m.content} —</span></SceneMeta>
  if (m.kind === 'photo') {
    return (
      <Reportable id={m.id} kind="photo">
        {reality && <RealityTag sender={reality.senderLabel} channel={reality.channelLabel} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.content} alt={reality?.caption ? t('캐릭터가 보낸 사진 — {caption}', { caption: reality.caption }) : t('캐릭터가 보낸 사진')} className={styles.photo} onLoad={onGrow} />
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
  return <Reportable id={m.id} kind="message"><CharacterBubble m={m} name={characterName} portrait={portrait} typing={typing} mood={mood} onGrow={onGrow} onDone={onDone} /></Reportable>
}

function CharacterBubble({ m, name, portrait, typing = false, mood = 'neutral', onGrow, onDone }: {
  m: Msg; name: string; portrait?: string | null; typing?: boolean; mood?: Mood; onGrow?: () => void; onDone?: () => void
}) {
  // 상황은 말풍선 밖, 행동·속마음은 같은 인물의 말풍선 안에서 대사와 구분한다.
  const t = useT()
  const { theme } = useChatTheme()
  const segments = segmentReply(m.blocks, m.content, name)
  const count = segments.reduce((n, s) => n + s.paragraphs.length, 0)
  // 문단을 하나씩 친다 — 문단이 많은 응답은 전체가 빨라진다.
  const [typed, setTyped] = useState(0)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => { if (typing && typed >= count) done.current?.() }, [typing, typed, count])
  const pace = m.opening ? 1 : replyPace(count)
  const line = (p: Paragraph) => typing && p.index === typed
    ? <TypedText text={p.text} mood={m.opening ? 'neutral' : mood} pace={pace} maxParagraphMs={m.opening ? OPENING_PARAGRAPH_MS : undefined} onGrow={onGrow} onDone={() => { setTyped(p.index + 1); onGrow?.() }} />
    : <Emphasis text={p.text} />

  return <div className={styles.reply}>
    {segments.map((seg, i) => {
      const hidden = typing && seg.paragraphs[0]!.index > typed
      if (seg.kind === 'narration') return (
        <div key={i} className={styles.narration} hidden={hidden} data-narration>
          <svg className={styles.sceneIcon} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
          <div className={styles.narrationText}>
            {seg.paragraphs.map((p) => <p key={p.index} hidden={typing && p.index > typed}>{p.kind === 'thought' && <span className="sr-only">{t('속마음: ')}</span>}{line(p)}</p>)}
          </div>
        </div>
      )
      const own = seg.speaker === name
      return (
        <div key={i} className={styles.characterRow} hidden={hidden}>
          {(() => {
            const face = theme !== 'miro' ? <DefaultChatAvatar /> : own && portrait
              ? <CharacterPhoto src={portrait} alt="" size="avatar" sizes="32px" width={32} height={32} />
              : seg.speaker.slice(0, 1)
            return <span className={styles.avatar} aria-hidden>{face}</span>
          })()}
          <div className={styles.characterContent}>
            <p className={styles.speaker}>{seg.speaker}</p>
            <div className={styles.timedBubble}><div className={styles.bubble}>
              {seg.paragraphs.map((p) => (
                <p key={p.index} className={p.kind === 'thought' ? styles.thought : p.kind === 'action' ? styles.action : undefined}
                  hidden={typing && p.index > typed} data-thought={p.kind === 'thought' || undefined}>
                  {p.kind === 'thought' && <span className="sr-only">{t('속마음: ')}</span>}
                  {line(p)}
                </p>
              ))}
            </div>{i === segments.map(s => s.kind).lastIndexOf('bubble') && <BubbleTime m={m}/>}</div>
          </div>
        </div>
      )
    })}
  </div>
}

function BubbleTime({ m }: { m: Msg }) {
  const { theme } = useChatTheme()
  if (theme !== 'talk' || !m.at || m.hideTime || !Number.isFinite(Date.parse(m.at))) return null
  return <time className={styles.bubbleTime} dateTime={m.at}>{new Date(m.at).toLocaleTimeString('ko-KR', {timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit',hour12:true})}</time>
}

function RealityTag({ sender, channel }: { sender?: string; channel?: string }) {
  return <p className="t-micro" style={{ color: 'var(--color-accent-text)', textTransform: 'none', letterSpacing: '0.04em' }}>{[sender, channel].filter(Boolean).join(' · ')}</p>
}

/** 화면에 별도 신고 버튼을 두지 않고 길게 누르면 신고 메뉴를 연다. */
function Reportable({ id, kind, children }: { id: string; kind: 'message' | 'photo'; children: React.ReactNode }) {
  const t = useT()
  const [menu, setMenu] = useState(false)
  const { handlers } = usePress({ onLongPress: () => setMenu(true) })
  const href = `/report?type=${kind}&id=${id}`
  return (
    <div {...handlers} className="stack" style={{ gap: 6, position: 'relative', touchAction: 'pan-y' }}>
      {children}
      <Popover open={menu} onClose={() => setMenu(false)}>
        <MenuItem type="button" onClick={() => { setMenu(false); window.location.href = href }}>{t('이 내용 신고')}</MenuItem>
      </Popover>
    </div>
  )
}
