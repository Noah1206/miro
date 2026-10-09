'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Pressable, StatusIcon } from '@/components/ui'
import styles from './messages.module.css'
import type { TurnState } from '@/lib/simulation/turn-action'
import { useTurns } from '../../chat/[sessionId]/turns'
import { streamTurn } from '../../chat/[sessionId]/stream-turn'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'

/** 문자 입력. 캐릭터챗 입력과 같은 파이프라인이지만 모델 선택·초안 저장 없이 문자답게 가볍다. */
export function MessengerComposer({ sessionId, characterName }: { sessionId: string; characterName: string }) {
  const t = useT()
  const { append, setLive } = useTurns()
  const [state, action, pending] = useActionState(async (_previous: TurnState, form: FormData): Promise<TurnState> => {
    try { return await streamTurn(form, setLive) }
    catch { return { error: msg('연결이 끊겼어요. 다시 보내면 처리 결과를 확인해요.'), notice: null, limit: null, retryWithSameId: true } }
  }, { error: null, notice: null, limit: null } satisfies TurnState)
  const [requestId, setRequestId] = useState('')
  const [draft, setDraft] = useState('')
  useEffect(() => { setRequestId(crypto.randomUUID()) }, [])
  useEffect(() => {
    // 결과가 오면 오던 말풍선을 거두고 저장본으로 — 같은 렌더에서 바뀐다.
    setLive(null)
    if (state.succeeded) { setDraft(''); setRequestId(crypto.randomUUID()); if (state.messages?.length) append(state.messages) }
    else if (state.error && !state.retryWithSameId) setRequestId(crypto.randomUUID())
  }, [state, append, setLive])
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (ta.current) { ta.current.style.height = 'auto'; ta.current.style.height = `${Math.min(ta.current.scrollHeight, 120)}px` } }, [draft])
  return (
    <div className={styles.composer}>
      {(pending || state.keepWaiting) && <p role="status" className="t-caption" style={{ marginBottom: 6, color: 'var(--color-text-tertiary)' }}>{t('{name} 입력 중', { name: characterName })}<span className={styles.typing} aria-hidden><i /><i /><i /></span></p>}
      {state.error && <p role="alert" className="t-caption" style={{ marginBottom: 6, color: 'var(--color-danger)' }}>{t(state.error)}</p>}
      {state.notice && !pending && <p role="status" className="t-caption" style={{ marginBottom: 6, color: 'var(--color-text-tertiary)' }}>⚠ {t(state.notice)}</p>}
      {/* 캐릭터가 자거나 바빠도 안내하지 않는다(10/9) — 실제 문자처럼 보낸 말만 남고, 답할지는 캐릭터가 깨어나 성격대로 정한다. */}
      <form action={action} className={styles.form}>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="mode" value="messenger" />
        <textarea ref={ta} className={styles.input} name="input" value={draft} disabled={pending || !requestId} rows={1} required maxLength={2000} placeholder={t('문자 보내기')} aria-label={t('문자 입력')}
          onChange={(e) => { setDraft(e.currentTarget.value); setRequestId(crypto.randomUUID()) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey || window.matchMedia('(pointer: fine)').matches)) { e.preventDefault(); if (!pending && e.currentTarget.value.trim()) e.currentTarget.form?.requestSubmit() } }} />
        <Pressable type="submit" disabled={pending || !requestId || !draft.trim()} aria-label={t('보내기')} className={styles.send}>
          {pending ? <StatusIcon status="loading" /> : <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>}
        </Pressable>
      </form>
    </div>
  )
}
