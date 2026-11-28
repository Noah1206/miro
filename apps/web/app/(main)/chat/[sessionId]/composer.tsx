'use client'
import { ChatEmojiButton, ChatSendIcon, ChatInputMore } from '@/components/chat-input-tools'
import { useEffect, useRef, useState, useTransition, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Pressable, TransitionLink, useToast } from '@/components/ui'
import { ATTENDANCE_GRANT, MIN_TURN_BALANCE } from '@miro/config'
import styles from './chat.module.css'
import glass from '@/components/chat-composer-glass.module.css'
import { GUEST_SEND } from '@/lib/guest-chat'
import { tween } from '@/lib/motion/tokens'
import { ModelPicker, useChatModel } from './model-picker'
import { PersonaPicker } from './persona-picker'
import { SuggestButton, SuggestList, type SuggestState } from './suggest-replies'
import { ChatSlashMenu, type SelectedCommand } from '@/components/chat-slash-menu'
import { COPY } from '@/lib/copy'
import type { TurnState } from '@/lib/simulation/turn-action'
import { ENDING_VIEW, REROLL, UNDO, useTurns, type LiveTurn } from './turns'
import { useChatPace } from '@/components/chat-pace'
import { undoTurn } from './actions'
import { useChosenThinking } from '@/components/reply-length-sheet'
import { streamTurn } from './stream-turn'
import { useImmersive } from './immersive'
import { subject } from '@/lib/format'
import { msg } from '@/lib/i18n'
import { useWallet } from '@/components/wallet/provider'
import { useT } from '@/lib/i18n/client'

/** 실패한 턴의 기다림을 유지하는 시간. 이보다 길어지면 멈춘 앱처럼 보인다. */
const KEEP_WAITING_MS = 12_000
/** 첫 글자가 이만큼 안 오면 멈춘 게 아니라고 조용히 알린다(10/17 — 공급자 재시도로 20초까지 늘어지는 턴). */
const SLOW_NOTICE_MS = 12_000

/** 자유 입력. 선택지 없음. 보내는 동안엔 "답을 고르고 있다" — 기계 느낌을 줄인다 (DESIGN §24). 모델 선택은 입력란과 설정 메뉴에서 공유한다. */
export function ChatComposer({ sessionId, characterName, modelOptions, messengerHref, commands = [], photo, firstReplies, adultAllowed = false }: {
  /** 11/22 `/` 목록의 명령어 직접 만들기에서 '언베일 전용' 스위치를 보여 줄지(만 19세 이상). */
  adultAllowed?: boolean
  sessionId: string; characterName: string; modelOptions: ComponentProps<typeof ModelPicker>; messengerHref?: string
  /** 제작자가 붙인 명령어(10/19). `/` 버튼으로 골라 보내면 그 턴만 지시대로 쓴다. */
  commands?: Array<{ name: string; hint: string }>
  /** 사진 버튼(11/2) — 사진 생성이 켜진 방에서만 넘긴다. */
  photo?: { unveil: boolean; bundle: boolean; audience?: 'male' | 'female'; scenes?: Array<{ id: string; label: string; unveil: boolean }> }
  /** 추천 첫 답변(11/10, 크랙) — 첫 턴에만 넘긴다. 입력창 위에 미리 띄운다. *별표* 는 행동. */
  firstReplies?: string[]
  /** 페르소나 드롭다운(11/3) — 모델 선택 옆. */
  persona?: ComponentProps<typeof PersonaPicker>
}) {
  const t = useT()
  const { append, live, setLive, calendarPending, remove } = useTurns()
  const [state, setState] = useState<TurnState>({ error: null, notice: null, limit: null })
  // 막힌 턴 토스트는 4초 뒤 스스로 걷힌다.
  // 11/24 오류 안내 토스트 — 4초 보이고 사라진다. 상태(state.error·retryWithSameId)는 그대로 둔다: 같은 요청으로 다시 보내는 판단에 쓰인다.
  const [errorToast, setErrorToast] = useState<string | null>(null)
  useEffect(() => {
    if (!state.error || state.limit || state.blocked) { setErrorToast(null); return }
    setErrorToast(state.error)
    const id = setTimeout(() => setErrorToast(null), 4000)
    return () => clearTimeout(id)
  }, [state])
  useEffect(() => { if (!state.blocked) return; const id = setTimeout(() => setState(st => st.blocked ? { ...st, error: null, blocked: false } : st), 4000); return () => clearTimeout(id) }, [state.blocked])
  const [pending, setPending] = useState(false)
  // 추천 답변(11/3) — 후보 3개와 실패 문구.
  const [suggest, setSuggest] = useState<SuggestState>(() => firstReplies?.length ? firstReplies.map(asSuggestion) : null)
  const [suggestError, setSuggestError] = useState('')
  // 11/22 사용자: 추천 답변은 만들어진 자리(대화 맨 끝)에 그대로 — 위로 스크롤하면 대화와 함께 올라가 안 보인다. 대화 목록 끝 자리(#suggest-slot)로 옮겨 그린다.
  const [suggestSlot, setSuggestSlot] = useState<HTMLElement | null>(null)
  useEffect(() => { setSuggestSlot(document.getElementById('suggest-slot')) }, [])
  useEffect(() => {
    const box = suggestSlot?.parentElement
    if (!suggest || !box) return
    const id = requestAnimationFrame(() => box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' }))
    return () => cancelAnimationFrame(id)
  }, [suggest, suggestSlot])
  // 11/23 사용자: 대기 표시가 입력창 위에 떠서 스크롤하면 글 위에 겹쳤다 — 대화 끝 자리(#typing-slot)에 그린다.
  const [typingSlot, setTypingSlot] = useState<HTMLElement | null>(null)
  useEffect(() => { setTypingSlot(document.getElementById('typing-slot')) }, [])
  const [command, setCommand] = useState<SelectedCommand | null>(null)
  const [refreshing, startRefresh] = useTransition()
  const hadRefresh = useRef(false)
  const sending = useRef(false)
  /** reroll: 마지막 답을 다시 받는 전송 — 쓰던 글·고른 명령어는 건드리지 않고, 옛 턴이 지워진 뒤 실패하면 그 말을 입력창에 돌려놓는다. */
  async function action(form: FormData, reroll = false) {
    if (sending.current) return
    sending.current = true
    setPending(true)
    voice.markSend(form.get('voice') === '1')
    // 보낸 글은 바로 비운다 — 답을 기다리는 동안 다음 말을 쓸 수 있게(10/17 사용자). 실패하면 다시 보낼 수 있게 되돌리되,
    // 그 사이 새로 쓴 글은 덮어쓰지 않는다.
    const sent = { input: String(form.get('input') ?? ''), requestId: String(form.get('requestId') ?? '') }
    if (!reroll) setDraft('')
    const restore = (sameId: boolean) => {
      if (draftNow.current.trim()) return
      setDraft(sent.input); setRequestId(sameId ? sent.requestId : crypto.randomUUID())
    }
    let undone = false
    try {
      const result = await streamTurn(form, setLive, ids => { undone = true; remove(ids) })
      if (result.undone?.length) { undone = true; remove(result.undone) }
      setState(result)
      if (result.limit) lowBalanceToast()
      if (result.limit && !result.limit.attend) openRecharge()
      if (reroll) { if (!result.succeeded && undone) restore(false) }
      else if (result.succeeded) { setCommand(null); if (!draftNow.current.trim()) setRequestId(crypto.randomUUID()) }
      else if (!result.keepWaiting) restore(!!result.retryWithSameId)
    } catch {
      setState({ error: msg('연결이 끊겼어요. 입력한 내용은 보관했어요. 다시 전송하면 처리 결과를 확인해요.'), notice: null, limit: null, retryWithSameId: true })
      setLive(null)
      if (!reroll) restore(true)
      else if (undone) restore(false)
    } finally {
      sending.current = false
      setPending(false)
      requestAnimationFrame(() => ta.current?.focus({ preventScroll: true }))
    }
  }
  const { model, setModel } = useChatModel()
  const router = useRouter()
  const voice = useImmersive()
  const { refreshBalance, wallet, openRecharge } = useWallet()
  // 11/18 사용자: 잔액이 최소(500)보다 적으면 보내지 않고 위에서 내려오는 빨간 토스트로 알린다. 서버도 같은 기준으로 막는다(turn.ts).
  const toast = useToast()
  const lowBalanceToast = () => toast(t('토큰이 {amount}개 이상 있어야 보낼 수 있어요', { amount: MIN_TURN_BALANCE.toLocaleString() }), 'error')
  const choice = modelOptions.choices?.find(c => c.id === model) ?? modelOptions.choices?.find(c => c.length === (model === 'pro' ? 'long' : 'scene'))
  // 11/19 오픈 이벤트 무료 모델은 잔액과 상관없이 보낸다(음성 턴은 서버가 평소대로 막는다).
  const lowBalance = wallet && !choice?.free ? wallet.available < MIN_TURN_BALANCE : false
  // 11/10 생각 강도 — 서버가 강도만큼 턴 한도를 늘리므로(turn.ts thinkScale) 보내는 상한도 같이 늘린다.
  // 11/10: 고른 적이 없으면 보내지 않는다 — 전엔 화면 기본값(high)이 매 턴 실려 모든 턴이 깊은 생각(느림·비용)으로 돌았다.
  const thinking = useChosenThinking()
  const [pacing] = useChatPace()   // 11/24 전개 설정 — 이 기기에서 고른 값을 턴마다 싣는다
  const thinkScale = thinking ? ({ low: 1, medium: 2, high: 3, xhigh: 4, max: 5 } as const)[thinking] : 1
  const tokenCeiling = choice ? Math.min(choice.maximumTokens * thinkScale, wallet?.available ?? choice.maximumTokens * thinkScale) : undefined
  const previousModel = useRef(model)
  useEffect(() => { if (previousModel.current !== model) { setRequestId(crypto.randomUUID()); previousModel.current = model } }, [model])
  const [requestId, setRequestId] = useState('')
  const [draft, setDraft] = useState('')
  // 11/3: 입력칸 맨 앞의 '/명령어' — 띄어쓰기 전까지는 명령어 찾기로 쓴다(라이브러리 목록이 위로 뜬다).
  const slashQuery = /^\/(\S{0,40})$/.exec(draft)?.[1] ?? null
  const draftNow = useRef(draft)
  draftNow.current = draft
  const [ready, setReady] = useState(false)
  const hasText = (!!draft.trim() && slashQuery === null) || !!command
  const storageKey = `miro:chat-draft:${sessionId}`
  useEffect(() => {
    let input = '', id = crypto.randomUUID()
    try {
      // 11/17 쓰던 글은 탭을 닫거나 나갔다 와도 남게 localStorage(전엔 sessionStorage — 새로고침만 버텼다).
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (saved && typeof saved.input === 'string' && saved.input.length <= 2000 && typeof saved.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(saved.requestId)) {
        input = saved.input; id = saved.requestId
        if (saved.command && typeof saved.command.name === 'string' && saved.command.name.length > 0 && saved.command.name.length <= 12
          && (!saved.command.sourceId || typeof saved.command.sourceId === 'string' && /^[0-9a-f-]{36}$/i.test(saved.command.sourceId))) setCommand(saved.command)
        const restoredModel = modelOptions.choices?.some(c => c.id === saved.model) || saved.model === 'pro' ? saved.model : 'miro'
        previousModel.current = restoredModel; setModel(restoredModel)
      }
      // 11/27 게스트 대화창에서 적은 말 — 로그인·온보딩 뒤 이 방으로 넘어오면 채워서 바로 보낸다(10분 안).
      const guest = JSON.parse(localStorage.getItem(GUEST_SEND) ?? 'null')
      if (guest?.sessionId === sessionId) {
        localStorage.removeItem(GUEST_SEND)
        if (!input && typeof guest.text === 'string' && guest.text.length <= 2000 && Date.now() - Number(guest.at) < 600_000) { input = guest.text; setAutoSend(true) }
      }
    } catch { /* Storage may be unavailable in private browsing. */ }
    setDraft(input); setRequestId(id); setReady(true)
  }, [storageKey, sessionId])
  const [autoSend, setAutoSend] = useState(false)
  useEffect(() => { if (autoSend && ready && draft.trim()) { setAutoSend(false); ref.current?.requestSubmit() } }, [autoSend, ready, draft])
  useEffect(() => {
    if (!ready) return
    try {
      if (draft || command) localStorage.setItem(storageKey, JSON.stringify({ input: draft, requestId, model, command }))
      else localStorage.removeItem(storageKey)
    } catch { /* Draft persistence must not prevent sending. */ }
  }, [draft, command, requestId, model, ready, storageKey])
  // 11/17 답이 나오는 중에 새로고침했으면 서버에서 진행 중인 턴을 이어 받아 그대로 보여 준다(api/turn/live). 끝나면 저장본을 다시 불러온다.
  useEffect(() => {
    if (!ready) return
    let alive = true
    const ctrl = new AbortController()
    void (async () => {
      const res = await fetch(`/api/turn/live?sessionId=${sessionId}`, { signal: ctrl.signal }).catch(() => null)
      if (!alive || !res || res.status !== 200 || !res.body || sending.current) return
      sending.current = true; setPending(true)
      const playbackId = `resume:${crypto.randomUUID()}`
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done || !alive) break
          buffer += value
          for (let nl = buffer.indexOf('\n'); nl >= 0; nl = buffer.indexOf('\n')) {
            const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1)
            if (!line.trim()) continue
            const event = JSON.parse(line) as { type: 'blocks'; input: string; blocks: LiveTurn['blocks'] } | { type: 'done' }
            if (event.type === 'blocks') setLive({ input: event.input, blocks: event.blocks, playbackId })
          }
        }
      } catch { /* 끊기면 저장본을 다시 불러오는 것으로 끝낸다 */ }
      if (!alive) return
      sending.current = false; setPending(false); setLive(null)
      void refreshBalance(true)
      startRefresh(() => router.refresh())
    })()
    return () => { alive = false; ctrl.abort() }
    // 화면을 연 한 번만 — 그 뒤 턴은 직접 보낸 스트림이 그린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sessionId])
  useEffect(() => {
    // 결과가 오면 오던 답(스트리밍)을 거둔다 — 성공이면 같은 렌더에서 저장본이 그 자리를 채우고, 실패면 저장되지 않은 답은 사라진다.
    const playbackId = live?.playbackId
    setLive(null)
    if (state.succeeded) {
      void refreshBalance(true)
      if (state.messages?.length) {
        // Keep the streaming row's identity: its current paragraph continues typing after persistence.
        append(state.messages, { playbackId })
        startRefresh(() => router.refresh())
      }
    }
    else if (state.error) {
      void refreshBalance(true)
      if (!state.retryWithSameId && !draftNow.current.trim()) setRequestId(crypto.randomUUID())
    }
    // live 는 결과가 올 때의 값만 본다 — 블록이 올 때마다 이 효과를 다시 돌리지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, append, router, setLive])

  /**
   * 생성이 실패한 턴은 오류 문구 대신 기다림을 이어 둔다 — 캐릭터가 아직 쓰는 중인 것처럼.
   *
   * 다만 영원히 두지는 않는다. 답은 오지 않으므로, 한참 지나면 조용히 거둬 다시 입력할 수 있게 한다.
   * 그대로 두면 유저는 앱이 멈춘 줄 알고 나가고, 새로고침하면 점마저 사라져 아무 기록도 남지 않는다.
   */
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    if (!state.keepWaiting) return
    setWaiting(true)
    if (!draftNow.current.trim()) setRequestId(crypto.randomUUID())
    const timer = setTimeout(() => setWaiting(false), KEEP_WAITING_MS)
    return () => clearTimeout(timer)
  }, [state])
  // 유저가 다시 쓰기 시작하면 기다림은 끝난 것이다.
  useEffect(() => { if (draft) setWaiting(false) }, [draft])
  // 첫 블록이 오면 점 대신 답이 보인다.
  // 11/16 음성 모드에선 소리가 시작될 때까지 글을 잡아 두므로 그동안 점을 계속 보인다.
  const showTyping = (pending && (!live?.blocks.length || voice.live)) || waiting || voice.holding
  // 11/23 사용자: 얼마나 기다렸는지 숫자로 — 대기 표시가 보이는 동안 1초마다.
  const [waited, setWaited] = useState(0)
  useEffect(() => {
    setWaited(0)
    if (!showTyping) return
    const start = Date.now(), id = setInterval(() => setWaited(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [showTyping])
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (!pending || live?.blocks.length) return
    const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [pending, !!live?.blocks.length])
  const ref = useRef<HTMLFormElement>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  // 11/20 사용자: 보낸 뒤 답이 화면에 나오기 전까지는 입력칸을 막고, 답이 보이는 순간 다시 연다(쓰던 중이었으면 커서도 돌려준다).
  const awaiting = pending && (!live?.blocks.length || voice.live)
  const refocus = useRef(false)
  const wasAwaiting = useRef(false)
  // 막히기 직전(그리기 단계, 아직 포커스가 있을 때) 입력칸에 커서가 있었는지 기억한다 — 막힌 뒤엔 브라우저가 포커스를 뺀다.
  if (awaiting && !wasAwaiting.current && typeof document !== 'undefined') refocus.current = document.activeElement === ta.current
  wasAwaiting.current = awaiting
  useEffect(() => {
    if (!awaiting && refocus.current) { refocus.current = false; ta.current?.focus() }
  }, [awaiting])
  // 11/19 되돌리기: 마지막 답 카드의 되돌리기 아이콘 — 그 턴을 지우고 보낸 말을 입력칸에(쓰던 글이 있으면 그대로 둔다).
  const undoLatest = useRef({ remove, router, toast })
  undoLatest.current = { remove, router, toast }
  useEffect(() => {
    const onUndo = async (event: Event) => {
      const { replyId } = (event as CustomEvent<{ replyId: string }>).detail
      if (sending.current) return
      sending.current = true
      try {
        const r = await undoTurn(sessionId, replyId)
        const { remove: drop, router: nav, toast: say } = undoLatest.current
        if (!r.ok) { say(t(r.error), 'error'); return }
        drop(r.messageIds)
        if (!draftNow.current.trim()) setDraft(r.input)
        startRefresh(() => nav.refresh())
      } catch { undoLatest.current.toast(t('이 답은 지금 되돌릴 수 없어요.'), 'error') }
      finally { sending.current = false }
    }
    window.addEventListener(UNDO, onUndo)
    return () => window.removeEventListener(UNDO, onUndo)
  }, [sessionId, t])

  // 리롤(10/27): 마지막 답 아래 '다시 받기' — 지금 고른 모델로 같은 말을 다시 보낸다. 보낼 말·명령어는 서버가 되돌리기 기록에서 꺼낸다.
  const latest = useRef({ action, ready, calendarPending })
  latest.current = { action, ready, calendarPending }
  useEffect(() => {
    const onReroll = (event: Event) => {
      const { replyId, input } = (event as CustomEvent<{ replyId: string; input: string }>).detail
      const { action: send, ready: canSend, calendarPending: busy } = latest.current
      if (sending.current || !canSend || busy || !ref.current) return
      const form = new FormData(ref.current)
      form.set('input', input); form.set('requestId', crypto.randomUUID()); form.set('reroll', replyId)
      void send(form, true)
    }
    const onEnding = (event: Event) => {
      const { name } = (event as CustomEvent<{ name: string }>).detail
      const { action: send, ready: canSend, calendarPending: busy } = latest.current
      if (sending.current || !canSend || busy || !ref.current) return
      const form = new FormData(ref.current)
      form.set('input', msg('엔딩 보기')); form.set('ending', name); form.set('requestId', crypto.randomUUID()); form.delete('command'); form.delete('commandId')
      void send(form, true)   // 쓰던 글은 그대로 둔다
    }
    window.addEventListener(REROLL, onReroll)
    window.addEventListener(ENDING_VIEW, onEnding)
    return () => { window.removeEventListener(REROLL, onReroll); window.removeEventListener(ENDING_VIEW, onEnding) }
  }, [])
  useEffect(() => {
    if (refreshing) { hadRefresh.current = true; return }
    if (!hadRefresh.current || !state.succeeded) return
    hadRefresh.current = false
    // Next can focus main after refreshing the saved turn. Keep typing ready without
    // stealing focus if the user opened another control while that refresh was pending.
    const active = document.activeElement
    if (active === document.body || active?.id === 'main') ta.current?.focus({ preventScroll: true })
  }, [refreshing, state.succeeded])
  useEffect(() => { if (ta.current) { ta.current.style.height = 'auto'; ta.current.style.height = `${Math.min(ta.current.scrollHeight, Math.min(window.innerHeight * 0.4, 320))}px` } }, [draft])

  // 11/19: 입력창이 대화 위에 떠 있으니, 대화 끝이 가려지지 않게 입력창 높이를 --composer-h 로 알린다.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current, host = el?.parentElement
    if (!el || !host) return
    const ro = new ResizeObserver(() => host.style.setProperty('--composer-h', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const host = typingSlot?.parentElement
    if (!showTyping || !host) return
    const id = requestAnimationFrame(() => host.scrollTo({ top: host.scrollHeight, behavior: 'smooth' }))
    return () => cancelAnimationFrame(id)
  }, [showTyping, typingSlot])
  const typing = (
          <motion.p key="thinking" role="status" className="t-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween.fast} style={{ marginTop: waited > 0 ? 26 : 0, marginBottom: 10, display: 'flex', alignItems: 'center' }}>
            {/* 11/11 사용자: 베이비챗처럼 글 없이 점 셋만(흰→회색 색 순환, 1.2초). 화면 낭독기에는 글로 알린다. */}
            <span className="sr-only">{t('{subject} 입력 중', { subject: subject(characterName), name: characterName })}</span>
            {/* 11/24 사용자: 기다린 초는 점 박스 위에, 박스 왼쪽 끝에 맞춰 — 초 밑에 밑줄(border). 박스 크기는 그대로 두고 위에 띄워 그린다. */}
            <span className={styles.typingBubble} aria-hidden><span className={styles.typingDots}><i /><i /><i /></span>
              {waited > 0 && <span style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, paddingBottom: 2, borderBottom: '1px solid currentColor', whiteSpace: 'nowrap', color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{t('{n}초', { n: waited })}</span>}
            </span>
            {slow && <span style={{ marginLeft: 8, color: 'var(--color-text-tertiary)' }}>{t('조금 오래 걸리고 있어요')}</span>}
          </motion.p>
  )
  return (
    <div ref={box} className={styles.composer} data-chat-composer>
      {typingSlot && createPortal(<AnimatePresence initial={false}>{showTyping && typing}</AnimatePresence>, typingSlot)}
      <AnimatePresence initial={false}>
        {showTyping && !typingSlot && typing}
        {state.notice && !showTyping && <motion.p key="notice" role="status" className="t-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginBottom: 8, color: 'var(--color-text-tertiary)' }}>⚠ {t(state.notice)}</motion.p>}
        {/* 11/10 잔액 부족 + 오늘 출석 안 함 → 출석 안내(출석했으면 안 나오고 충전 시트가 열린다). */}
        {state.limit?.attend && (
          <motion.div key="attend" role="alert" className="t-caption" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tween.enter}
            style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '10px 12px', borderRadius: 12, background: 'var(--color-surface-2)', color: 'var(--color-text-primary)' }}>
            <span style={{ flex: 1, minWidth: 0 }}>{t('토큰이 부족해요. 오늘 출석 체크를 하면 {amount}토큰을 받아요.', { amount: ATTENDANCE_GRANT.daily.toLocaleString() })}</span>
            <TransitionLink href="/my" style={{ flex: 'none', padding: '6px 12px', borderRadius: 8, background: 'var(--color-accent)', color: 'var(--color-white, #fff)', fontWeight: 650 }}>{t('출석하러 가기')}</TransitionLink>
          </motion.div>
        )}
        {/* 11/21 사용자: 안전 필터로 막힌 턴은 글 한 줄 대신 아래에서 올라오는 토스트 — 왼쪽에 빨간 X 스티커, 4초 뒤 사라진다. */}
        {state.error && !state.limit && state.blocked && (
          <div key="blocked" className={styles.blockedToastWrap}><motion.div role="alert" className={styles.blockedPoster}
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
            <span className={styles.blockedSticker} aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </span>
            <span className={styles.blockedText}>
              <strong>{t('이 내용으로는 대화를 이어갈 수 없어요')}</strong>
              <span>{t('다른 상황으로 이야기해 주세요.')}</span>
            </span>
          </motion.div></div>
        )}
        {/* 11/24 사용자: 입력창 위에 빨간 글로 남던 오류 안내(연결 끊김·저장 실패 등)도 토스트로 — 왼쪽에 빨간 아이콘, 4초 뒤 아래로 내려가며 사라진다. */}
        {errorToast && (
          <div key="err" className={styles.blockedToastWrap}><motion.div role="alert" className={`${styles.blockedPoster} ${styles.errorPoster}`}
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
            <span className={styles.blockedSticker} aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 7v6M12 17h.01" /></svg>
            </span>
            <span className={styles.blockedText}><span>{t(errorToast)}</span></span>
          </motion.div></div>
        )}
      </AnimatePresence>
      {suggest && (list => suggestSlot ? createPortal(list, suggestSlot) : list)(<SuggestList state={suggest} onClose={() => setSuggest(null)} onPick={(text, send) => {
        setDraft(text); setRequestId(crypto.randomUUID()); setSuggest(null)
        if (send) setTimeout(() => ref.current?.requestSubmit(), 0); else ta.current?.focus()
      }} />)}
      {suggestError && <p role="alert" className="t-caption" style={{ marginBottom: 8, color: 'var(--color-danger)' }}>{t(suggestError)}</p>}
      <form ref={ref} autoComplete="off" onSubmit={event => { event.preventDefault(); if (!sending.current && ready && !calendarPending && (draft.trim() || command)) { if (lowBalance) lowBalanceToast(); else void action(new FormData(event.currentTarget)) } }} className={`${styles.composerForm} ${glass.surface}`}>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="chatModel" value={model} />
        {/* 11/11 음성 모드가 켜져 있으면 늘 — 'live'(무료 합성 조건까지)일 때만 보내 서버가 음성 꺼짐으로 보고 신음 태그(speech)를 빼고 썼다. */}
        {voice.on && <input type="hidden" name="voice" value="1" />}
        {tokenCeiling !== undefined && <input type="hidden" name="tokenCeiling" value={tokenCeiling} />}
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="command" value={command?.name ?? ''} />
        {thinking && <input type="hidden" name="thinking" value={thinking} />}
        {pacing.pace !== 'balanced' && <input type="hidden" name="pace" value={pacing.pace} />}
        {pacing.timeSkip && <input type="hidden" name="timeSkip" value="1" />}
        <input type="hidden" name="commandId" value={command?.sourceId ?? ''} />
        {/* 고른 명령어(10/19) — 이번 턴만 이 지시대로. 글을 덧붙이지 않아도 보낼 수 있다. */}
        {command && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span className="t-caption" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--color-accent)', color: 'var(--color-accent-on)', fontWeight: 'var(--weight-semibold)' }}>
            /{command.name}
            <button type="button" onClick={() => { setCommand(null); setRequestId(crypto.randomUUID()) }} aria-label={t('명령어 빼기')} style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, padding: 0, border: 0, borderRadius: 9, background: 'rgba(0,0,0,.18)', color: 'inherit', cursor: 'pointer' }}>
              <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        </div>}
        <div className={styles.inputRow}>
          {/* 11/6 사용자: ✳︎(상황 묘사)는 입력칸 왼쪽 */}
          <ChatEmojiButton textareaRef={ta} onDraftChange={value => { setDraft(value); setRequestId(crypto.randomUUID()) }} disabled={awaiting || calendarPending || !ready} onSelect={emoji => { setDraft(value => value + emoji); setRequestId(crypto.randomUUID()); ta.current?.focus() }} />
          <textarea className={styles.input} ref={ta} name="input" autoComplete="off" data-1p-ignore data-lpignore="true" value={draft} disabled={awaiting || calendarPending || !ready} rows={1} required={!command} maxLength={2000}
            placeholder={command ? t('덧붙일 말이 있으면 적어요. 없어도 보낼 수 있어요.') : t('대사, 행동, 묘사를 자유롭게…')} aria-label={t(COPY.a11y.composer)}
            onChange={(e) => { setDraft(e.currentTarget.value); setRequestId(crypto.randomUUID()); voice.wake() /* 11/24 음성이 켜진 방이면 쓰는 동안 서버를 깨워 둔다(2분에 한 번) */ }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && slashQuery !== null) { e.preventDefault(); return } if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey || window.matchMedia('(pointer: fine)').matches)) { e.preventDefault(); if (!pending && (e.currentTarget.value.trim() || command)) e.currentTarget.form?.requestSubmit() } }}
            />
        </div>
        {/* Selected model stays beside the input tools; prices appear only in the selector. */}
        <div className={styles.composerRow}>
          <div className={styles.composerTools}>
            <ModelPicker {...modelOptions} place="up" disabled={pending || calendarPending || !ready}/>
            <ChatInputMore disabled={awaiting || calendarPending || !ready} onInsert={text => { setDraft(value => (value + text).slice(0, 2000)); setRequestId(crypto.randomUUID()); ta.current?.focus() }} />
            {/* 11/4 사용자: 사진·✳︎·/·추천은 입력창 아래 도구 줄로 내렸다. 페르소나 드롭다운·마이크는 뺐다. */}
            <ChatSlashMenu commands={commands} adultAllowed={adultAllowed} messengerHref={messengerHref} disabled={pending || calendarPending || !ready} typed={slashQuery}
              onSlash={() => { if (draft.trim() && slashQuery === null) return false; setDraft('/'); setRequestId(crypto.randomUUID()); requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(1, 1) } }); return true }}
              onOoc={() => { const head = slashQuery !== null || !draft.trim() ? '' : draft.trimEnd() + ' '; setDraft(head + '(OOC: )'); setRequestId(crypto.randomUUID()); requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(head.length + 6, head.length + 6) } }) }}
              onPick={value => { setCommand(value); if (slashQuery !== null) setDraft(''); setRequestId(crypto.randomUUID()); ta.current?.focus() }} />
          </div>
        <div className={styles.composerBar}>
          {/* 11/6 사용자: 추천 답변은 보내기 버튼 바로 옆 */}
          <SuggestButton sessionId={sessionId} disabled={pending || calendarPending || !ready} loading={suggest === 'loading'} open={Array.isArray(suggest)} onChange={setSuggest} onError={setSuggestError} />
          <Pressable data-empty={!draft.trim()} type="submit" disabled={pending || calendarPending || !ready || !hasText} aria-label={t(COPY.cta.send)} className={styles.send}>
            {/* 11/22 사용자: 기다리는 동안에도 빙글이 대신 원래 보내기 모양(비활성) */}<ChatSendIcon />
          </Pressable>
        </div>
        </div>
      </form>
    </div>
  )
}

/** 작품이 적은 추천 첫 답변 한 줄 → 추천 카드. *별표* 안은 행동, 나머지는 대사. */
function asSuggestion(line: string): { say: string; act: string } {
  const act = [...line.matchAll(/\*([^*]+)\*/g)].map(m => m[1]!.trim()).join(' ')
  const say = line.replace(/\*[^*]+\*/g, '').trim().replace(/^"|"$/g, '')
  return { say, act }
}
