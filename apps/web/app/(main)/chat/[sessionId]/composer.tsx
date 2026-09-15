'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Pressable, StatusIcon, TransitionLink } from '@/components/ui'
import styles from './chat.module.css'
import { tween } from '@/lib/motion/tokens'
import { useChatModel } from './model-picker'
import { COPY } from '@/lib/copy'
import { sendTurn, type TurnState } from './actions'

/** 자유 입력. 선택지 없음. 보내는 동안엔 "답을 고르고 있다" — 기계 느낌을 줄인다 (DESIGN §24). */
export function ChatComposer({ sessionId, characterName }: { sessionId: string; characterName: string }) {
  const [state, action, pending] = useActionState(async (previous: TurnState, form: FormData): Promise<TurnState> => {
    try { return await sendTurn(previous, form) }
    catch { return { error: '연결이 끊겼어요. 입력한 내용은 보관했어요. 다시 전송하면 처리 결과를 확인해요.', notice: null, limit: null, retryWithSameId: true } }
  }, { error: null, notice: null, limit: null } satisfies TurnState)
  const { model, setModel } = useChatModel()
  const previousModel = useRef(model)
  useEffect(() => { if (previousModel.current !== model) { setRequestId(crypto.randomUUID()); previousModel.current = model } }, [model])
  const [requestId, setRequestId] = useState('')
  const [draft, setDraft] = useState('')
  const [ready, setReady] = useState(false)
  const hasText = !!draft.trim()
  const storageKey = `miro:chat-draft:${sessionId}`
  useEffect(() => {
    let input = '', id = crypto.randomUUID()
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
      if (saved && typeof saved.input === 'string' && saved.input.length <= 2000 && typeof saved.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(saved.requestId)) {
        input = saved.input; id = saved.requestId
        const restoredModel = saved.model === 'pro' ? 'pro' : 'miro'
        previousModel.current = restoredModel; setModel(restoredModel)
      }
    } catch { /* Storage may be unavailable in private browsing. */ }
    setDraft(input); setRequestId(id); setReady(true)
  }, [storageKey])
  useEffect(() => {
    if (!ready) return
    try {
      if (draft) sessionStorage.setItem(storageKey, JSON.stringify({ input: draft, requestId, model }))
      else sessionStorage.removeItem(storageKey)
    } catch { /* Draft persistence must not prevent sending. */ }
  }, [draft, requestId, model, ready, storageKey])
  useEffect(() => {
    if (state.succeeded) { setDraft(''); setRequestId(crypto.randomUUID()) }
    else if (state.error && !state.retryWithSameId) setRequestId(crypto.randomUUID())
  }, [state])
  const ref = useRef<HTMLFormElement>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (ta.current) { ta.current.style.height = 'auto'; ta.current.style.height = `${Math.min(ta.current.scrollHeight, 140)}px` } }, [draft])

  return (
    <div className={styles.composer}>
      <AnimatePresence initial={false}>
        {pending && <motion.p key="thinking" role="status" className="t-caption t-quote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween.fast} style={{ marginBottom: 8 }}>{characterName}이(가) 답을 고르고 있다…</motion.p>}
        {state.notice && !pending && <motion.p key="notice" role="status" className="t-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginBottom: 8, color: 'var(--color-text-tertiary)' }}>⚠ {state.notice}</motion.p>}
        {state.error && (
          <motion.p key="err" role="alert" className="t-caption" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tween.enter} style={{ marginBottom: 8, color: 'var(--color-danger)' }}>
            {state.error}
            {state.limit && <> <TransitionLink href="/recharge" style={{ textDecoration: 'underline', marginLeft: 6, color: 'var(--color-text-primary)' }}>충전소</TransitionLink></>}
            {state.limit?.plan === 'free' && <> <TransitionLink href="/plans" style={{ textDecoration: 'underline', marginLeft: 6, color: 'var(--color-text-primary)' }}>Pro 알아보기</TransitionLink></>}
          </motion.p>
        )}
      </AnimatePresence>
      <form ref={ref} action={action} className={styles.composerForm}>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="chatModel" value={model} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <textarea className={styles.input} ref={ta} name="input" value={draft} disabled={pending || !ready} rows={1} required maxLength={2000} placeholder="대사, 행동, 묘사를 자유롭게…" aria-label={COPY.a11y.composer}
          onChange={(e) => { setDraft(e.currentTarget.value); setRequestId(crypto.randomUUID()) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey || window.matchMedia('(pointer: fine)').matches)) { e.preventDefault(); if (!pending && e.currentTarget.value.trim()) e.currentTarget.form?.requestSubmit() } }}
          />
        <Pressable type="submit" disabled={pending || !ready || !hasText} aria-label={COPY.cta.send} className={styles.send}>
          {pending ? <StatusIcon status="loading" /> : <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>}
        </Pressable>
      </form>
    </div>
  )
}
