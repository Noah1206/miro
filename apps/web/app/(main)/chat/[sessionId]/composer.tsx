'use client'
import { ChatEmojiButton, ChatSendIcon, ChatInputMore } from '@/components/chat-input-tools'
import { useEffect, useRef, useState, useTransition, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { Pressable, StatusIcon } from '@/components/ui'
import styles from './chat.module.css'
import { tween } from '@/lib/motion/tokens'
import { type ModelPicker, useChatModel } from './model-picker'
import { ChatSlashMenu, type SelectedCommand } from '@/components/chat-slash-menu'
import { COPY } from '@/lib/copy'
import type { TurnState } from '@/lib/simulation/turn-action'
import { useTurns } from './turns'
import { streamTurn } from './stream-turn'
import { MicButton } from './immersive'
import { subject } from '@/lib/format'
import { msg } from '@/lib/i18n'
import { useWallet } from '@/components/wallet/provider'
import { useT } from '@/lib/i18n/client'

/** 실패한 턴의 기다림을 유지하는 시간. 이보다 길어지면 멈춘 앱처럼 보인다. */
const KEEP_WAITING_MS = 12_000
/** 첫 글자가 이만큼 안 오면 멈춘 게 아니라고 조용히 알린다(10/17 — 공급자 재시도로 20초까지 늘어지는 턴). */
const SLOW_NOTICE_MS = 12_000

/** 자유 입력. 선택지 없음. 보내는 동안엔 "답을 고르고 있다" — 기계 느낌을 줄인다 (DESIGN §24). 모델 선택은 헤더에서 공유한다. */
export function ChatComposer({ sessionId, characterName, modelOptions, messengerHref, commands = [] }: {
  sessionId: string; characterName: string; modelOptions: ComponentProps<typeof ModelPicker>; messengerHref?: string
  /** 제작자가 붙인 명령어(10/19). `/` 버튼으로 골라 보내면 그 턴만 지시대로 쓴다. */
  commands?: Array<{ name: string; hint: string }>
}) {
  const t = useT()
  const { append, live, setLive, calendarPending } = useTurns()
  const [state, setState] = useState<TurnState>({ error: null, notice: null, limit: null })
  const [pending, setPending] = useState(false)
  const [command, setCommand] = useState<SelectedCommand | null>(null)
  const [refreshing, startRefresh] = useTransition()
  const hadRefresh = useRef(false)
  const sending = useRef(false)
  async function action(form: FormData) {
    if (sending.current) return
    sending.current = true
    setPending(true)
    // 보낸 글은 바로 비운다 — 답을 기다리는 동안 다음 말을 쓸 수 있게(10/17 사용자). 실패하면 다시 보낼 수 있게 되돌리되,
    // 그 사이 새로 쓴 글은 덮어쓰지 않는다.
    const sent = { input: String(form.get('input') ?? ''), requestId: String(form.get('requestId') ?? '') }
    setDraft('')
    const restore = (sameId: boolean) => {
      if (draftNow.current.trim()) return
      setDraft(sent.input); setRequestId(sameId ? sent.requestId : crypto.randomUUID())
    }
    try {
      const result = await streamTurn(form, setLive)
      setState(result)
      if (result.limit) openRecharge()
      if (result.succeeded) { setCommand(null); if (!draftNow.current.trim()) setRequestId(crypto.randomUUID()) }
      else if (!result.keepWaiting) restore(!!result.retryWithSameId)
    } catch {
      setState({ error: msg('연결이 끊겼어요. 입력한 내용은 보관했어요. 다시 전송하면 처리 결과를 확인해요.'), notice: null, limit: null, retryWithSameId: true })
      setLive(null)
      restore(true)
    } finally {
      sending.current = false
      setPending(false)
      requestAnimationFrame(() => ta.current?.focus({ preventScroll: true }))
    }
  }
  const { model, setModel } = useChatModel()
  const router = useRouter()
  const { refreshBalance, wallet, openRecharge } = useWallet()
  const choice = modelOptions.choices?.find(c => c.id === model) ?? modelOptions.choices?.find(c => c.length === (model === 'pro' ? 'long' : 'scene'))
  const tokenCeiling = choice ? Math.min(choice.maximumTokens, wallet?.available ?? choice.maximumTokens) : undefined
  const previousModel = useRef(model)
  useEffect(() => { if (previousModel.current !== model) { setRequestId(crypto.randomUUID()); previousModel.current = model } }, [model])
  const [requestId, setRequestId] = useState('')
  const [draft, setDraft] = useState('')
  const draftNow = useRef(draft)
  draftNow.current = draft
  const [ready, setReady] = useState(false)
  const hasText = !!draft.trim() || !!command
  const storageKey = `miro:chat-draft:${sessionId}`
  useEffect(() => {
    let input = '', id = crypto.randomUUID()
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
      if (saved && typeof saved.input === 'string' && saved.input.length <= 2000 && typeof saved.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(saved.requestId)) {
        input = saved.input; id = saved.requestId
        if (saved.command && typeof saved.command.name === 'string' && saved.command.name.length > 0 && saved.command.name.length <= 12
          && (!saved.command.sourceId || typeof saved.command.sourceId === 'string' && /^[0-9a-f-]{36}$/i.test(saved.command.sourceId))) setCommand(saved.command)
        const restoredModel = modelOptions.choices?.some(c => c.id === saved.model) || saved.model === 'pro' ? saved.model : 'miro'
        previousModel.current = restoredModel; setModel(restoredModel)
      }
    } catch { /* Storage may be unavailable in private browsing. */ }
    setDraft(input); setRequestId(id); setReady(true)
  }, [storageKey])
  useEffect(() => {
    if (!ready) return
    try {
      if (draft || command) sessionStorage.setItem(storageKey, JSON.stringify({ input: draft, requestId, model, command }))
      else sessionStorage.removeItem(storageKey)
    } catch { /* Draft persistence must not prevent sending. */ }
  }, [draft, command, requestId, model, ready, storageKey])
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
  const showTyping = (pending && !live?.blocks.length) || waiting
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (!pending || live?.blocks.length) return
    const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [pending, !!live?.blocks.length])
  const ref = useRef<HTMLFormElement>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (refreshing) { hadRefresh.current = true; return }
    if (!hadRefresh.current || !state.succeeded) return
    hadRefresh.current = false
    // Next can focus main after refreshing the saved turn. Keep typing ready without
    // stealing focus if the user opened another control while that refresh was pending.
    const active = document.activeElement
    if (active === document.body || active?.id === 'main') ta.current?.focus({ preventScroll: true })
  }, [refreshing, state.succeeded])
  useEffect(() => { if (ta.current) { ta.current.style.height = 'auto'; ta.current.style.height = `${Math.min(ta.current.scrollHeight, 140)}px` } }, [draft])

  return (
    <div className={styles.composer} data-chat-composer>
      <AnimatePresence initial={false}>
        {showTyping && (
          <motion.p key="thinking" role="status" className="t-caption t-quote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween.fast} style={{ marginBottom: 8 }}>
            {t('{subject} 입력 중', { subject: subject(characterName), name: characterName })}
            <span className={styles.typingDots} aria-hidden><i /><i /><i /></span>
            {slow && <span style={{ marginLeft: 8, color: 'var(--color-text-tertiary)' }}>{t('조금 오래 걸리고 있어요')}</span>}
          </motion.p>
        )}
        {state.notice && !showTyping && <motion.p key="notice" role="status" className="t-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginBottom: 8, color: 'var(--color-text-tertiary)' }}>⚠ {t(state.notice)}</motion.p>}
        {state.error && !state.limit && (
          <motion.p key="err" role="alert" className="t-caption" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tween.enter} style={{ marginBottom: 8, color: 'var(--color-danger)' }}>
            {t(state.error)}
          </motion.p>
        )}
      </AnimatePresence>
      <form ref={ref} autoComplete="off" onSubmit={event => { event.preventDefault(); if (!sending.current && ready && !calendarPending && (draft.trim() || command)) void action(new FormData(event.currentTarget)) }} className={styles.composerForm}>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="chatModel" value={model} />
        {tokenCeiling !== undefined && <input type="hidden" name="tokenCeiling" value={tokenCeiling} />}
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="command" value={command?.name ?? ''} />
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
        <textarea className={styles.input} ref={ta} name="input" autoComplete="off" data-1p-ignore data-lpignore="true" value={draft} disabled={calendarPending || !ready} rows={1} required={!command} maxLength={2000}
          placeholder={command ? t('덧붙일 말이 있으면 적어요. 없어도 보낼 수 있어요.') : t('대사, 행동, 묘사를 자유롭게…')} aria-label={t(COPY.a11y.composer)}
          onChange={(e) => { setDraft(e.currentTarget.value); setRequestId(crypto.randomUUID()) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey || window.matchMedia('(pointer: fine)').matches)) { e.preventDefault(); if (!pending && (e.currentTarget.value.trim() || command)) e.currentTarget.form?.requestSubmit() } }}
          />
        {/* Model choice is in the header; room controls are in the slash palette. */}
        <div className={styles.composerRow}>
          <div className={styles.composerTools}>
            <ChatInputMore disabled={calendarPending || !ready} onInsert={text => { setDraft(value => (value + text).slice(0, 2000)); setRequestId(crypto.randomUUID()); ta.current?.focus() }} />
            {/* 몰입 모드(10/19): 말로 쓰기 — 말이 끝나면 그대로 보낸다. */}
            <MicButton disabled={pending || calendarPending || !ready} onDraft={value => { setDraft(value); setRequestId(crypto.randomUUID()) }}
              onSubmit={value => { setDraft(value); setRequestId(crypto.randomUUID()); setTimeout(() => ref.current?.requestSubmit(), 0) }} />
          </div>
        <div className={styles.composerBar}>
          <ChatEmojiButton textareaRef={ta} onDraftChange={value => { setDraft(value); setRequestId(crypto.randomUUID()) }} disabled={calendarPending || !ready} onSelect={emoji => { setDraft(value => value + emoji); setRequestId(crypto.randomUUID()); ta.current?.focus() }} />
          <ChatSlashMenu commands={commands} messengerHref={messengerHref} disabled={pending || calendarPending || !ready}
            onPick={value => { setCommand(value); setRequestId(crypto.randomUUID()) }} />
          <Pressable data-empty={!draft.trim()} type="submit" disabled={pending || calendarPending || !ready || !hasText} aria-label={t(COPY.cta.send)} className={styles.send}>
            {pending ? <StatusIcon status="loading" /> : <ChatSendIcon />}
          </Pressable>
        </div>
        </div>
      </form>
    </div>
  )
}
