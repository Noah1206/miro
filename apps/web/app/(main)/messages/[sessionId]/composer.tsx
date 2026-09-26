'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Pressable, StatusIcon } from '@/components/ui'
import styles from './messages.module.css'
import { sendMessengerTurn, type TurnState } from './actions'
import { useTurns } from '../../chat/[sessionId]/turns'

/** 문자 입력. 캐릭터챗 입력과 같은 파이프라인이지만 모델 선택·초안 저장 없이 문자답게 가볍다. */
export function MessengerComposer({ sessionId, characterName }: { sessionId: string; characterName: string }) {
  const [state, action, pending] = useActionState(async (previous: TurnState, form: FormData): Promise<TurnState> => {
    try { return await sendMessengerTurn(previous, form) }
    catch { return { error: '연결이 끊겼어요. 다시 보내면 처리 결과를 확인해요.', notice: null, limit: null, retryWithSameId: true } }
  }, { error: null, notice: null, limit: null } satisfies TurnState)
  const { append } = useTurns()
  const [requestId, setRequestId] = useState('')
  const [draft, setDraft] = useState('')
  useEffect(() => { setRequestId(crypto.randomUUID()) }, [])
  useEffect(() => {
    if (state.succeeded) { setDraft(''); setRequestId(crypto.randomUUID()); if (state.messages?.length) append(state.messages) }
    else if (state.error && !state.retryWithSameId) setRequestId(crypto.randomUUID())
  }, [state, append])
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (ta.current) { ta.current.style.height = 'auto'; ta.current.style.height = `${Math.min(ta.current.scrollHeight, 120)}px` } }, [draft])
  return (
    <div className={styles.composer}>
      {(pending || state.keepWaiting) && <p role="status" className="t-caption" style={{ marginBottom: 6, color: 'var(--color-text-tertiary)' }}>{characterName} 입력 중<span className={styles.typing} aria-hidden><i /><i /><i /></span></p>}
      {state.error && <p role="alert" className="t-caption" style={{ marginBottom: 6, color: 'var(--color-danger)' }}>{state.error}</p>}
      {state.notice && !pending && <p role="status" className="t-caption" style={{ marginBottom: 6, color: 'var(--color-text-tertiary)' }}>⚠ {state.notice}</p>}
      {state.delayed && !pending && <p role="status" data-reply-delayed className="t-caption" style={{ marginBottom: 6, color: 'var(--color-text-tertiary)' }}>{characterName}은(는) 지금 {state.delayed.label} 중이에요 — 끝나면 답장이 와요.</p>}
      <form action={action} className={styles.form}>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <textarea ref={ta} className={styles.input} name="input" value={draft} disabled={pending || !requestId} rows={1} required maxLength={2000} placeholder="문자 보내기" aria-label="문자 입력"
          onChange={(e) => { setDraft(e.currentTarget.value); setRequestId(crypto.randomUUID()) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey || window.matchMedia('(pointer: fine)').matches)) { e.preventDefault(); if (!pending && e.currentTarget.value.trim()) e.currentTarget.form?.requestSubmit() } }} />
        <Pressable type="submit" disabled={pending || !requestId || !draft.trim()} aria-label="보내기" className={styles.send}>
          {pending ? <StatusIcon status="loading" /> : <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>}
        </Pressable>
      </form>
    </div>
  )
}
