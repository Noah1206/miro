'use client'
import { useChatTheme, DefaultChatAvatar } from '@/components/chat-theme'
import { bindChatComposerFollow } from '@/components/chat-viewport'
import { AnimatePresence } from 'motion/react'
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './chat.module.css'
import { Popover, MenuItem, ButtonLink } from '@/components/ui'
import { Line, SceneMeta } from '@/components/scene/text'
import { Emphasis } from '@/components/scene/emphasis'
import { TypedText } from '@/components/scene/typed-text'
import { BOX_END_PAUSE_MS, OPENING_PARAGRAPH_MS, PHOTO_PAUSE_MS, REPLY_TYPING_PACE, replyTypingBoost } from '@/components/scene/typing'
import { UnveilCover } from '@/components/unveil-badge'
import type { Mood } from '@miro/domain'
import { usePress } from '@/lib/motion/use-press'
import { CONTINUE, ENDING_VIEW, UNDO, useTurns } from './turns'
import { CONTINUE_INPUT } from '@/lib/simulation/pace'
import { segmentReply, type Paragraph } from './reply-segments'
import { useT } from '@/lib/i18n/client'
import { useOpeningPlayback } from './use-opening-playback'
import { useImmersive } from './immersive'
import { PhotoButton } from './photo-button'
import { endingReady, endingTitle } from '@/lib/novel-ending'

type PhotoProps = { unveil: boolean; bundle: boolean; audience?: 'male' | 'female'; scenes: Array<{ id: string; label: string; unveil: boolean }> }

export type Msg = { at?: string; hideTime?: boolean; opening?: boolean; id: string; role: string; kind: string; content: string; blocks: Array<Record<string, unknown>> }

export function MessageList({ items: server, characterName, portrait, mood = 'neutral', sessionId, hasStarted = false, veilPhotos = false, cast = [], photo, castPhotos = {}, endings = [], afterIntro }: {
  /** 11/20 사용자: 작품의 플레이 가이드 — 인트로(첫 장면) 바로 밑에 붙는다. 인트로가 없으면 맨 위. */
  afterIntro?: ReactNode
  /** 11/10 작품이 정한 엔딩(크랙 엔딩 설정) — 엔딩 카드에 등급을, 아직 못 본 엔딩은 힌트로. */
  endings?: Array<{ name: string; grade: string; hint?: string; image?: string }>
  /** 11/6: 인물 이름 → 사진(여러 인물 카드). 말풍선 아바타가 이름 첫 글자 대신 이 사진. */
  castPhotos?: Record<string, string>
  items: Msg[]; characterName: string; portrait?: string | null
  /** 11/6: 사진 만들기 — 캐릭터 답변마다 그 아래 버튼. 없으면(기능 꺼짐) 버튼도 없다. */
  photo?: PhotoProps
  /** 11/6: 여러 인물 카드의 히로인 이름 — 히로인의 속마음을 그 히로인 말풍선에 붙인다. */
  cast?: readonly string[]
  /** 11/6: 언베일을 안 켠 사람 — 사진 메시지를 흐리고 누르면 언베일 켜기로. */
  veilPhotos?: boolean
  sessionId?: string; hasStarted?: boolean
  /** 캐릭터의 지금 기분 — 타이핑 속도가 여기서 나온다. */
  mood?: Mood
}) {
  // 서버 목록 뒤에 방금 보낸 턴을 붙인다. refresh 로 서버 목록에 같은 id 가 실리면 그쪽만 남는다.
  const t = useT()
  const { appended, quiet, playbackKeys, live, removed } = useTurns()
  const { theme } = useChatTheme()
  const voice = useImmersive()
  const known = new Set(server.map((m) => m.id))
  // 오고 있는 답(스트리밍)은 맨 뒤에 — 보낸 말과 지금까지 받은 블록. 저장된 답이 오면 사라지고 그 자리를 저장본이 채운다.
  const liveKey = live?.playbackId ?? 'live'
  const liveItems: Msg[] = live ? [{ id: `${liveKey}:user`, role: 'user', kind: 'text', content: live.input, blocks: [] },
    // 11/16 음성 모드: 오고 있는 답의 글은 보여 주지 않는다 — 소리가 시작될 때 같이 나온다(그동안은 입력창 위 점).
    ...(live.blocks.length && !voice.live ? [{ id: `${liveKey}:reply`, role: 'character', kind: 'text', content: '', blocks: live.blocks }] : [])] : []
  const merged = [...server, ...appended.filter((m) => !known.has(m.id))].filter((m) => !removed.has(m.id))
  // 11/18 사용자: 상황별 사진은 답 중간 — 자리(anchor.after)가 적힌 사진 행은 목록에서 빼고, 바로 앞 답의 그 블록 뒤에 그린다.
  const inline = new Map<string, InlinePhoto[]>()
  const anchored = new Set<string>()
  merged.forEach((m, i) => {
    const after = m.kind === 'photo' && m.blocks[0]?.type === 'anchor' ? Number(m.blocks[0].after) : 0
    if (!after) return
    let j = i - 1
    while (j >= 0 && anchored.has(merged[j]!.id)) j--
    const reply = merged[j]
    const block = reply?.role === 'character' && reply.kind === 'text' ? reply.blocks[after - 1] : undefined
    if (!reply || !block) return
    anchored.add(m.id)
    inline.set(reply.id, [...(inline.get(reply.id) ?? []), { block, photo: m }])
  })
  // 11/20 사용자: 오고 있는 답에도 사진이 그 자리에 바로 — 블록이 그 자리까지 오면(쓰는 중인 블록 말고) 그 뒤에, 자리가 없거나 아직 못 오면 답 끝(타이핑이 끝나야 보임).
  if (live?.photos?.length && live.blocks.length && !voice.live) {
    const id = `${liveKey}:reply`
    live.photos.forEach((p, k) => {
      const at = p.after ? live.blocks[p.after - 1] : undefined
      const block = at && !at.partial ? at : {}
      inline.set(id, [...(inline.get(id) ?? []), { block, photo: { id: `${liveKey}:photo:${k}`, role: 'character', kind: 'photo', content: p.url, blocks: [] } }])
    })
  }
  const settled = merged.filter((m) => !anchored.has(m.id))
  const items = [...settled, ...liveItems]
  const opening = useOpeningPlayback(sessionId, items, hasStarted)
  // 11/23 사용자 "인트로 사진이 로딩이 너무 오래 걸려": 인트로는 한 줄씩 차례로 나타나는데, 사진은 제 차례가 되어 화면에 붙을 때에야 받기 시작해 그때마다 기다렸다 —
  // 방에 들어오면 인트로 사진을 미리 받아 둔다(브라우저 캐시에 들어가 차례가 오면 바로 뜬다). 인트로를 보는 중일 때만, 최대 12장.
  const openingPhotos = opening.playing ? items.filter(m => m.opening && m.kind === 'photo').slice(0, 12).map(m => m.content).join('\n') : ''
  useEffect(() => { for (const src of openingPhotos.split('\n')) if (src) new Image().src = src }, [openingPhotos])
  // 11/24 이어서 받기로 보낸 턴은 보낸 말 자리가 표식뿐이라 말풍선을 그리지 않는다.
  const displayed = items.filter(m => opening.visible(m) && !voice.held(m.id) && !(m.role === 'user' && m.content === CONTINUE_INPUT))
  const keyOf = (m: Msg) => playbackKeys.get(m.id) ?? m.id
  const lastOpeningId = [...displayed].reverse().find(m => m.opening)?.id
  const guide = afterIntro && !opening.playing ? afterIntro : null
  // 11/9 웹소설: 결말 표식이 실린 답 뒤에 결말 카드. 표식 줄 자체는 말풍선에서 뺀다.
  // 11/10: 이어서 하다 다른 엔딩에 닿아도 카드가 뜨게 — 엔딩마다 처음 닿은 답에 하나씩.
  const endingIds = new Set<string>()
  { const got = new Set<string>(); for (const m of displayed) { const title = m.role !== 'user' ? endingTitle(m.blocks) : null; if (title && !got.has(title)) { got.add(title); endingIds.add(m.id) } } }
  // 11/10 엔딩 분기점: 마지막 답이 '엔딩 조건 달성' 표식이고 아직 고르지 않았으면 엔딩 보기/이어서를 묻는다. 그냥 다음 말을 쓰면 이어 가는 것이다.
  const [skipped, setSkipped] = useState<string | null>(null)
  const lastReply = [...settled].reverse().find(m => m.role !== 'user' && m.role !== 'system')
  const readyName = lastReply && settled[settled.length - 1]?.id === lastReply.id && lastReply.id !== skipped ? endingReady(lastReply.blocks) : null
  const readyDef = readyName ? endings.find(e => e.name === readyName) : undefined
  // 11/10 상태창 — 사용자 요청: 지난 상태창도 접지 않고 모두 펼쳐 둔다(사용자가 직접 접을 수는 있다).
  const end = useRef<HTMLDivElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const wasStreaming = useRef(false)
  // 이미 화면에 있던 메시지는 다시 치지 않는다. 처음 열 때 전부 다시 치면 대화가 재생된다.
  const seen = useRef<Set<string> | null>(null)
  if (seen.current === null) seen.current = new Set(items.map(keyOf))
  // 11/19 사용자: 보낸 말풍선은 살짝 올라오며 붙는다 — 방을 열 때 이미 있던 줄은 움직이지 않게 처음 목록을 따로 기억한다.
  const initialKeys = useRef<Set<string> | null>(null)
  if (initialKeys.current === null) initialKeys.current = new Set(items.map(keyOf))
  for (const id of quiet) if (!voice.held(id)) seen.current.add(playbackKeys.get(id) ?? id)
  const last = items[items.length - 1]
  // 치는 중인 메시지는 한 번 정해지면 다음 메시지가 올 때까지 바뀌지 않는다 — 백그라운드 refresh 로 목록이 갈려도 타이핑이 끊기지 않는다.
  const typing = useRef<string | null>(null)
  if (last && last.role !== 'user' && !seen.current.has(keyOf(last))) typing.current = keyOf(last)
  else if (!last || typing.current !== keyOf(last)) typing.current = null
  // 다 친 답은 타이핑에서 뺀다 — 전엔 다음 턴·새로고침 전까지 '치는 중'으로 남아 상태창·사진 버튼이 숨었다(11/10).
  const [typedKey, setTypedKey] = useState<string | null>(null)
  const typingId = typing.current !== typedKey ? typing.current : null
  // 리롤(10/27): 다 친 마지막 장면 답 하나만 다시 받을 수 있다. 그 답이 아직 마지막인지는 서버가 다시 본다.
  const lastSettled = settled[settled.length - 1]
  // 11/16 음성 모드에선 다시 받기 버튼을 숨긴다(서버도 음성 턴은 거절).
  const voiceOn = voice.on
  const rerollInput = !voiceOn && !live && hasStarted && !opening.playing && lastSettled?.role === 'character' && lastSettled.kind === 'text' && !lastSettled.opening
    && keyOf(lastSettled) !== typingId ? [...settled].reverse().find((m) => m.role === 'user')?.content : undefined

  // 타이핑 중에는 글자가 늘어날 때마다 바닥을 따라간다.
  const follow = useCallback(() => {
    const transcript = end.current?.parentElement
    if (following.current && transcript) transcript.scrollTop = transcript.scrollHeight
  }, [])
  useEffect(() => {
    if (last?.role === 'user' || (live && !wasStreaming.current)) following.current = true
    wasStreaming.current = !!live
    follow()
  }, [items.length, displayed.length, !!live, live?.blocks.length, follow])
  useEffect(() => { for (const m of items) if (!voice.held(m.id)) seen.current!.add(keyOf(m)) }, [items, playbackKeys])
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
    const stopComposerFollow = bindChatComposerFollow(transcript, () => { following.current = true; follow() })
    const resize = new ResizeObserver(follow)
    resize.observe(transcript)
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
      stopComposerFollow()
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
      {!lastOpeningId && guide}
      <AnimatePresence initial={false}>
        {displayed.map((m, index) => (
          <Line key={keyOf(m)} className={styles.messageLine} data-message-role={m.role} data-opening={(m.opening && m.role !== 'user') || undefined} data-kind={m.kind} data-fresh={m.role === 'user' && !initialKeys.current!.has(keyOf(m)) || undefined} layout={false} {...(quiet.has(m.id) || m.role === 'user' || m.role === 'character' && m.id === `${liveKey}:reply` ? { initial: false } : {})}>
            {/* 11/19 사용자: 기본 테마는 답 한 턴 = 카드 하나 — 글·상태창·사진 아이콘(맨 아래)이 같은 카드 안. 메신저 테마는 전처럼 카드 없이. */}
            <div className={theme === 'miro' && (m.role === 'character' || m.role === 'narrator') && m.kind === 'text' ? styles.turnCard : styles.turnPlain}>
            <Message m={{...m, blocks: m.role === 'user' ? m.blocks : m.blocks.filter(b => !endingTitle([b]) && !endingReady([b])), hideTime: !!m.at && displayed[index + 1]?.role === m.role && displayed[index + 1]?.at?.slice(0,16) === m.at.slice(0,16)}} characterName={characterName} portrait={portrait} veil={veilPhotos ? sessionId : undefined} cast={cast} castPhotos={castPhotos}
              typing={m.id === opening.activeId || keyOf(m) === typingId} mood={mood} onGrow={follow} onDone={() => { opening.advance(m.id); if (keyOf(m) === typing.current) setTypedKey(keyOf(m)) }}
              inline={inline.get(m.id)} renderPhoto={p => <Message key={p.id} m={p} characterName={characterName} veil={veilPhotos ? sessionId : undefined} onGrow={follow} />} />
            {(m.role === 'character' || m.role === 'narrator') && (m.id !== opening.activeId && keyOf(m) !== typingId) && <StatusCard blocks={m.blocks} open />}
            {(() => {
              const settledReply = m.role === 'character' && m.kind === 'text' && (!m.opening || !opening.playing) && m.id !== opening.activeId && keyOf(m) !== typingId
              // 11/19 사용자: 카드 맨 아래 줄 — 사진 아이콘 옆에 '되돌리기'(마지막 답에만, 그 턴을 지우고 보낸 말을 입력칸으로).
              const canUndo = theme === 'miro' && settledReply && rerollInput !== undefined && m.id === lastSettled?.id
              const canPhoto = settledReply && !!photo && !!sessionId
              // 11/24 사용자: 이어서 받기 — 마지막 답에만. 할 말이 없을 때 입력 없이 다음 장면을 받는다(보통 턴과 같은 값).
              const canContinue = settledReply && !!sessionId && !live && m.id === lastSettled?.id
              return (canPhoto || canUndo || canContinue) && <div className={styles.turnPhotoRow}>
                {canPhoto && <PhotoButton variant="turn" sessionId={sessionId!} unveil={photo!.unveil} bundle={photo!.bundle} audience={photo!.audience} custom={photo!.scenes} />}
                {canUndo && <button type="button" className={styles.turnPhoto} aria-label={t('되돌리기')} title={t('되돌리기')}
                  onClick={() => window.dispatchEvent(new CustomEvent(UNDO, { detail: { replyId: m.id } }))}>
                  <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
                  <span>{t('되돌리기')}</span>
                </button>}
                {canContinue && <button type="button" className={styles.turnPhoto} aria-label={t('이어서 받기')} title={t('이어서 받기')}
                  onClick={() => window.dispatchEvent(new CustomEvent(CONTINUE))}>
                  <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 6 6 6-6 6"/><path d="m13 6 6 6-6 6"/></svg>
                  <span>{t('이어서')}</span>
                </button>}
              </div>
            })()}
            </div>
            {m.id === lastOpeningId && guide}
            {sessionId && endingIds.has(m.id) && <aside className={styles.endingCard}>
              {(() => { const title = endingTitle(m.blocks); const def = endings.find(e => e.name === title); const others = endings.filter(e => e.name !== title)
                return <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {def?.image && <img src={def.image} alt="" className={styles.endingImage} />}
                <div className={styles.endingInfo}>
                  <strong>{def && <span className={styles.endingGrade} data-grade={def.grade}>{def.grade}</span>}ENDING · {title}</strong>
                  {others.length > 0 && <p>{t('다른 엔딩 {n}개', { n: others.length })}{others.some(e => e.hint) ? ` — ${others.filter(e => e.hint).map(e => e.hint).join(' · ')}` : ''}</p>}
                </div></> })()}
              <ButtonLink href={`/chat/${sessionId}/novel`} variant="primary" size="sm">{t('웹소설로 받기')}</ButtonLink>
            </aside>}
            {sessionId && readyName && m.id === lastReply?.id && !live && <aside className={styles.endingCard} aria-label={t('엔딩 조건 달성')}>
              <div className={styles.endingInfo}>
                <strong>{readyDef && <span className={styles.endingGrade} data-grade={readyDef.grade}>{readyDef.grade}</span>}{t('엔딩 조건 달성')} · {readyName}</strong>
                <p>{t('엔딩을 보면 이야기가 이 결말로 맺어져요. 이어서 하면 다른 엔딩을 찾을 수 있어요.')}</p>
              </div>
              <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                <button type="button" className={styles.endingSkip} onClick={() => setSkipped(m.id)}>{t('이어서 하기')}</button>
                <button type="button" className={styles.endingView} onClick={() => window.dispatchEvent(new CustomEvent(ENDING_VIEW, { detail: { name: readyName } }))}>{t('엔딩 보기')}</button>
              </div>
            </aside>}
          </Line>
        ))}
      </AnimatePresence>
    </div>
    {/* 만들어지는 사진 자리(11/9) — 사진은 대화 맨 끝에 붙으므로 사진 버튼이 여기로 그린다(photo-button.tsx). */}
    <div id="photo-making-slot" />
    {/* 11/23 사용자: 대기 표시(점 셋)는 입력창 위에 떠 있지 않고 대화 맨 끝에 — composer.tsx 가 여기로 그린다. */}
    <div id="typing-slot" />
    <div id="suggest-slot" />
    {opening.playing && <button type="button" className={styles.openingSkip} onClick={opening.finish}>{t('인트로 전체 보기')}</button>}
    {/* 11/7 사용자: 말풍선 밑 다시 받기 버튼은 지운다. */}
    <div ref={end} aria-hidden />
    </>
  )
}

/** 11/11 사용자: 상황 서술은 한 줄을 다 채우지 않고 문장마다 줄바꿈(데스크톱·폰 모두) — 문장 끝(. ! ? … 와 닫는 따옴표) 뒤 공백을 줄바꿈으로. */

/** 11/18 답 중간 사진 — block 은 답의 저장 블록(같은 객체), 그 블록 뒤에 photo 를 그린다. */
type InlinePhoto = { block: Record<string, unknown>; photo: Msg }

function Message({ m, characterName, portrait, typing = false, mood = 'neutral', onGrow, onDone, veil, cast, castPhotos, inline, renderPhoto }: {
  m: Msg; characterName: string; portrait?: string | null; veil?: string; typing?: boolean; mood?: Mood; onGrow?: () => void; onDone?: () => void; cast?: readonly string[]; castPhotos?: Record<string, string>
  inline?: InlinePhoto[]; renderPhoto?: (photo: Msg) => React.ReactNode
}) {
  const t = useT()
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => { if (typing && m.kind !== 'text') done.current?.() }, [typing, m.kind])
  // 인트로의 상황 서술(role narrator)은 블록 없이 글만 저장된다 — 캐릭터 말풍선이 아니라 장면 서술로 그린다(10/5).
  if (m.role === 'narrator' && m.kind === 'text' && !m.blocks.length) m = { ...m, blocks: [{ type: 'narrative', text: m.content }] }
  const reality = m.blocks.find((b) => b.type === 'reality') as { senderLabel?: string; channelLabel?: string; caption?: string | null } | undefined
  if (m.role === 'user') return <div className={styles.userRow}><BubbleTime m={m}/><UserBubble text={m.content} /></div>
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
        {veil
          ? <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)' }}>
              <img src={m.content} alt="" className={styles.photo} onLoad={onGrow} />
              <UnveilCover veiled label={t('언베일')} unlock={{ signedIn: true, returnTo: "/home?unveil=enable" }} />
            </div>
          : <img src={m.content} alt={reality?.caption ? t('캐릭터가 보낸 사진 — {caption}', { caption: reality.caption }) : t('캐릭터가 보낸 사진')} className={styles.photo} onLoad={onGrow} />}
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
          <CharacterBubble m={m} name={characterName} portrait={portrait} typing={typing} mood={mood} onGrow={onGrow} cast={cast} castPhotos={castPhotos} />
        </div>
      </Reportable>
    )
  }
  return <Reportable id={m.id} kind="message"><CharacterBubble m={m} name={characterName} portrait={portrait} typing={typing} mood={mood} onGrow={onGrow} onDone={onDone} cast={cast} castPhotos={castPhotos} inline={inline} renderPhoto={renderPhoto} /></Reportable>
}

function CharacterBubble({ m, name, typing = false, mood = 'neutral', onGrow, onDone, cast, inline = [], renderPhoto }: {
  m: Msg; name: string; portrait?: string | null; typing?: boolean; mood?: Mood; onGrow?: () => void; onDone?: () => void; cast?: readonly string[]; castPhotos?: Record<string, string>
  inline?: InlinePhoto[]; renderPhoto?: (photo: Msg) => React.ReactNode
}) {
  // 상황은 말풍선 밖, 행동·속마음은 같은 인물의 말풍선 안에서 대사와 구분한다.
  const t = useT()
  const { theme } = useChatTheme()
  const voice = useImmersive()
  // 11/19 사용자: 기본 테마는 한 턴을 한 덩어리 글로 — 말풍선·사진·이름 없이 서술 문단과 굵은 대사가 위에서 아래로 이어지고, 사진은 그 사이에 꽉 차게.
  const flow = theme === 'miro'
  // 11/22 사용자: 사진끼리 붙어 보이면 안 된다 — 한 덩어리 안에 사진 블록이 여럿이면 덩어리 끝에 몰려 붙었다. 사진이 붙는 블록이 끝나는 자리에서 덩어리를 나눠, 사진이 제 문단 바로 뒤에 온다.
  const photoBlocks = new Set(inline.map(x => x.block))
  const segments = segmentReply(m.blocks, m.content, name, cast).flatMap(seg => {
    const parts: (typeof seg)[] = []
    let cur: typeof seg.paragraphs = []
    seg.paragraphs.forEach((p, k) => {
      cur.push(p)
      const next = seg.paragraphs[k + 1]
      if (next && p.block && photoBlocks.has(p.block) && next.block !== p.block) { parts.push({ ...seg, paragraphs: cur }); cur = [] }
    })
    parts.push({ ...seg, paragraphs: cur })
    return parts
  })
  // 11/6: 음성 모드(무료)에선 말풍선을 누르면 그 말풍선의 대사를 다시 읽는다. 길게 누르기(신고)와 겹치지 않게 짧은 누름만.
  const replayable = voice.on && voice.free && !typing && /^[0-9a-f-]{36}$/i.test(m.id)
  const pressedAt = useRef(0)
  const replayProps = (texts: string[], base = styles.bubble) => replayable ? {
    className: `${base} ${styles.replayable}`, role: 'button', tabIndex: 0, 'aria-label': t('이 대사 다시 듣기'),
    onPointerDown: () => { pressedAt.current = Date.now() },
    onClick: () => { if (Date.now() - pressedAt.current < 450) voice.replay(m, texts) },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); voice.replay(m, texts) } },
  } : { className: base }
  const count = segments.reduce((n, s) => n + s.paragraphs.length, 0)
  // 11/19 마지막 블록이 아직 쓰는 중(서버 stream-blocks 의 partial) — 그 문단은 끝까지 쳐도 다음으로 넘어가지 않고 글이 더 오길 기다린다.
  const writing = (m.blocks.at(-1) as { partial?: unknown } | undefined)?.partial === true
  // 문단을 하나씩 친다 — 문단이 많은 응답은 전체가 빨라진다.
  const [typed, setTyped] = useState(0)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => { if (typing && typed >= count) done.current?.() }, [typing, typed, count])
  // 답은 압축 없이 한 글자씩(10/17 사용자: 뭉텅이 대신 "따다다닥") — 끊는 자리는 문장 끝과 박스 끝뿐. 인트로는 원래 리듬 그대로.
  const boxEnds = new Set(segments.map(seg => seg.paragraphs.at(-1)!.index))
  // 11/21 사용자: 사진이 뜨면 잠깐 멈춰 사진을 보게 한 뒤 다음 글을 친다 — 사진이 붙는 덩어리의 마지막 문단.
  const photoEnds = new Set(segments.filter(seg => inline.some(x => seg.paragraphs.some(p => p.block === x.block))).map(seg => seg.paragraphs.at(-1)!.index))
  // 밀린 글(지금 문단부터 이미 도착한 끝까지)이 많으면 빨리 친다 — 새 글이 도착할 때마다 다시 계산해 치는 도중에도 따라간다.
  const backlog = (from: number) => segments.reduce((n, seg) => n + seg.paragraphs.reduce((k, q) => k + (q.index >= from ? q.text.length : 0), 0), 0)
  // 사진이 뜬 다음 문단은 PHOTO_PAUSE_MS 동안 비워 둔다(사진 먼저, 그다음 글).
  const [hold, setHold] = useState(false)
  const holdForPhoto = () => { setHold(true); setTimeout(() => setHold(false), PHOTO_PAUSE_MS) }
  const line = (p: Paragraph) => typing && p.index === typed && hold ? null : typing && p.index === typed
    ? (m.opening
      ? <TypedText text={p.text} mood="neutral" pace={1} maxParagraphMs={OPENING_PARAGRAPH_MS} onGrow={onGrow} onDone={() => { setTyped(p.index + 1); onGrow?.() }} />
      : <TypedText text={p.text} mood={mood} pace={REPLY_TYPING_PACE} boost={voice.live ? 1 : replyTypingBoost(backlog(p.index))} maxParagraphMs={Infinity} sentencePausesOnly open={writing && p.index === count - 1}
          endPauseMs={boxEnds.has(p.index) ? BOX_END_PAUSE_MS : 260} onGrow={onGrow} onDone={() => { setTyped(p.index + 1); if (photoEnds.has(p.index)) holdForPhoto(); onGrow?.() }} />)
    : <Emphasis text={p.text} />

  // 11/12 사용자(제타 스크린샷): 상황 서술은 말풍선 밖(아이콘 없이 가운데 정렬·회색 기울임), 말풍선 안은 행동(회색 기울임)과 대사(흰 글씨 "…").
  const shown = segments
  const lastBubble = shown.map(s => s.kind).lastIndexOf('bubble')
  const paragraphClass = (p: Paragraph) => p.kind === 'thought' ? styles.thought : p.kind === 'action' ? styles.action : styles.dialogueLine
  const quoted = (p: Paragraph) => theme === 'miro' && p.kind === 'dialogue' && !/^["“'‘]/.test(p.text) ? { ...p, text: `"${p.text}"` } : p

  // 11/18 답 중간 사진: 그 블록이 든 덩어리 바로 뒤. 치는 중이면 그 덩어리를 다 친 뒤에 보인다. 자리를 못 찾은 사진은 답 끝.
  const placed = new Set<InlinePhoto>()
  const photosAfter = (seg: (typeof shown)[number]) => {
    const here = inline.filter(x => !placed.has(x) && seg.paragraphs.some(p => p.block === x.block))
    here.forEach(x => placed.add(x))
    return here.length && renderPhoto
      ? <div className={styles.inlinePhotos} hidden={typing && seg.paragraphs.at(-1)!.index >= typed} data-inline-photos>{here.map(x => renderPhoto(x.photo))}</div>
      : null
  }
  const segmentEls = shown.map((seg, i) => <Fragment key={i}>{segment(seg, i)}{photosAfter(seg)}</Fragment>)
  const rest = inline.filter(x => !placed.has(x))

  return <div className={flow ? `${styles.reply} ${styles.flow}` : styles.reply}>
    {segmentEls}
    {rest.length > 0 && renderPhoto && <div className={styles.inlinePhotos} hidden={typing && typed < count} data-inline-photos>{rest.map(x => renderPhoto(x.photo))}</div>}
  </div>

  function segment(seg: (typeof shown)[number], i: number) {
      const hidden = typing && seg.paragraphs[0]!.index > typed
      if (flow) {
        // 대사 덩어리의 첫 대사 앞에 '이름 |' — 말풍선이 없으니 누가 말하는지 여기서 보인다.
        const lead = seg.kind === 'bubble' && seg.speaker === name && cast?.length ? cast[0]! : null
        const who = seg.kind === 'bubble' ? lead ?? seg.speaker : null
        const firstLine = seg.paragraphs.find(p => p.kind === 'dialogue')
        const lines = seg.paragraphs.map((p) => (
          <p key={p.index} className={p.kind === 'thought' ? styles.thought : p.kind === 'dialogue' ? styles.flowLine : undefined}
            hidden={typing && p.index > typed} data-thought={p.kind === 'thought' || undefined}>
            {p.kind === 'thought' && <span className="sr-only">{t('속마음: ')}</span>}
            {who && p === firstLine && <><strong style={{ fontWeight: 700 }}>{who}</strong> | </>}
            {line(p.kind === 'dialogue' ? quoted(p) : p)}
          </p>
        ))
        return seg.kind === 'bubble'
          ? <div key={i} hidden={hidden} {...replayProps(seg.paragraphs.filter(p => p.kind === 'dialogue').map(p => p.text), styles.flowText)}>{lines}</div>
          : <div key={i} className={styles.flowText} hidden={hidden} data-narration>{lines}</div>
      }
      if (seg.kind === 'narration') return (
        <div key={i} className={styles.narration} hidden={hidden} data-narration>
          <div className={styles.narrationText}>
            {seg.paragraphs.map((p) => <p key={p.index} hidden={typing && p.index > typed}>{p.kind === 'thought' && <span className="sr-only">{t('속마음: ')}</span>}{line(p)}</p>)}
          </div>
        </div>
      )
      // 11/17 사용자: 여러 인물 카드에서 화자를 모르는 줄(카드 이름으로 온 줄)도 프로필 사진이 보이게 — 첫 장면을 이끄는 첫 인물(cast[0])로 보인다.
      const lead = seg.speaker === name && cast?.length ? cast[0]! : null
      const speaker = lead ?? seg.speaker
      return (
        <div key={i} className={styles.characterRow} hidden={hidden}>
          {/* 말풍선은 메신저 테마(dm·talk)에만 남았다 — 기본 아바타. 기본 테마는 위 flow 로 그린다. */}
          <span className={styles.avatar} aria-hidden><DefaultChatAvatar /></span>
          <div className={styles.characterContent}>
            <p className={styles.speaker}>{speaker}</p>
            <div className={styles.timedBubble}><div {...replayProps(seg.paragraphs.filter(p => p.kind === 'dialogue').map(p => p.text))}>
              {seg.paragraphs.map((p) => (
                <p key={p.index} className={paragraphClass(p)}
                  hidden={typing && p.index > typed} data-thought={p.kind === 'thought' || undefined}>
                  {p.kind === 'thought' && <span className="sr-only">{t('속마음: ')}</span>}
                  {line(quoted(p))}
                </p>
              ))}
            </div>{i === lastBubble && <BubbleTime m={m}/>}</div>
          </div>
        </div>
      )
  }
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
// 11/17 '이 장면 기억하기'(11/16) 삭제 — 기억 노트는 캐릭터가 매 턴·5턴마다 스스로 정리하는 기억이라 사용자가 직접 넣지 않는다.
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

/** 11/10 상태창 카드(크랙 INFO 블록) — 저장된 답의 status 블록을 접히는 카드로. 형식·스탯이 없는 작품엔 블록이 없어 아무것도 안 그린다. */
function StatusCard({ blocks, open }: { blocks: Array<Record<string, unknown>>; open: boolean }) {
  const t = useT()
  const b = blocks.find(x => x.type === 'status')
  if (!b) return null
  const text = typeof b.text === 'string' ? b.text.trim() : ''
  const stats = b.stats && typeof b.stats === 'object' ? Object.entries(b.stats as Record<string, number>) : []
  if (!text && !stats.length) return null
  return <details className={styles.statusCard} open={open}>
    <summary>{t('상태창')}</summary>
    {text ? <pre className={styles.statusText}>{text}</pre>
      : <ul className={styles.statusStats}>{stats.map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}</ul>}
  </details>
}

/**
 * 11/22 사용자: 내 말풍선이 여러 줄로 꺾이면 오른쪽에 빈 공간이 남았다 — 브라우저는 꺾인 상자를 가장 긴 줄에 맞춰 줄이지 않는다.
 * 그려진 뒤 실제 가장 긴 줄 너비를 재서 말풍선 폭을 거기에 맞춘다(화면 폭이 바뀌면 다시 잰다).
 */
function UserBubble({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.width = ''; el.style.textWrap = ''
      const cs = getComputedStyle(el)
      const lines = el.getClientRects()[0]
      const h = el.offsetHeight
      // 글자 마디(텍스트 노드)만 잰다 — 감싼 span/em 상자는 줄 끝까지 늘어나 보일 수 있다.
      const rows = new Set<number>()
      let left = Infinity, right = -Infinity
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        range.selectNodeContents(n)
        for (const r of Array.from(range.getClientRects())) { if (r.width < 1) continue; left = Math.min(left, r.left); right = Math.max(right, r.right); rows.add(Math.round(r.top)) }
      }
      if (!lines || rows.size < 2 || right <= left) return
      // 11/22: 방금 보낸 말풍선은 올라오는 애니메이션(scale .98) 중이라 화면 크기로 재면 작게 나와 줄이 다시 꺾이고 원래 폭으로 되돌아갔다 — 배율을 나눠 실제 크기로.
      const scale = el.getBoundingClientRect().width / el.offsetWidth || 1
      // 11/22: 말풍선의 text-wrap:pretty 는 폭을 좁히면 줄을 다시 고르게 나눠 3줄로 늘리곤 했다 → 아래에서 되돌려져 오른쪽 공백이 그대로 남았다.
      // 폭을 맞출 땐 보통 줄바꿈(wrap)으로 — 같은 폭에서 줄 수가 가장 적게 나와 줄이 늘지 않는다.
      el.style.textWrap = 'wrap'
      el.style.width = `${Math.ceil((right - left) / scale + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) + 2}px`
      if (el.offsetHeight > h) { el.style.width = ''; el.style.textWrap = '' }  // 그래도 줄이 늘면(다시 꺾이면) 되돌린다
    }
    fit()
    // 웹 글꼴이 늦게 오면 대체 글꼴로 잰 폭이 남는다 — 글꼴이 준비되면 다시 잰다.
    void document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    el.addEventListener('animationend', fit)
    return () => { window.removeEventListener('resize', fit); el.removeEventListener('animationend', fit) }
  }, [text])
  return <p ref={ref} className={styles.userBubble}><Emphasis text={text} /></p>
}
