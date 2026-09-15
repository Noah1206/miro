'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Pressable, StatusIcon, TransitionLink } from '@/components/ui'
import styles from './chat.module.css'
import { tween } from '@/lib/motion/tokens'
import { COPY } from '@/lib/copy'
import { sendTurn, type TurnState } from './actions'

/** 자유 입력. 선택지 없음. 보내는 동안엔 "답을 고르고 있다" — 기계 느낌을 줄인다 (DESIGN §24). */
export function ChatComposer({ sessionId, characterName }: { sessionId: string; characterName: string }) {
  const [state, action, pending] = useActionState(sendTurn, { error: null, notice: null, limit: null } satisfies TurnState)
  const [requestId, setRequestId] = useState('')
  const [hasText, setHasText] = useState(false)
  useEffect(() => { if (!pending) setRequestId(crypto.randomUUID()) }, [pending, state])
  const ref = useRef<HTMLFormElement>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (!pending && !state.error) { ref.current?.reset(); setHasText(false); if (ta.current) ta.current.style.height = 'auto' } }, [pending, state.error])

  return (
    <div className={styles.composer}>
      <AnimatePresence initial={false}>
        {pending && <motion.p key="thinking" role="status" className="t-caption t-quote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween.fast} style={{ marginBottom: 8 }}>{characterName}이(가) 답을 고르고 있다…</motion.p>}
        {state.notice && !pending && <motion.p key="notice" role="status" className="t-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginBottom: 8, color: 'var(--color-text-tertiary)' }}>⚠ {state.notice}</motion.p>}
        {state.error && (
          <motion.p key="err" role="alert" className="t-caption" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tween.enter} style={{ marginBottom: 8, color: 'var(--color-danger)' }}>
            {state.error}
            {state.limit?.plan === 'free' && <> <TransitionLink href="/plans" style={{ textDecoration: 'underline', marginLeft: 6, color: 'var(--color-text-primary)' }}>Pro 알아보기</TransitionLink></>}
          </motion.p>
        )}
      </AnimatePresence>
      <form ref={ref} action={action} className={styles.composerForm}>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <textarea className={styles.input} ref={ta} name="input" rows={1} required maxLength={2000} placeholder="대사, 행동, 묘사를 자유롭게…" aria-label={COPY.a11y.composer}
          onInput={(e) => { const el = e.currentTarget; setHasText(!!el.value.trim()); el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px` }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey || window.matchMedia('(pointer: fine)').matches)) { e.preventDefault(); if (!pending && e.currentTarget.value.trim()) e.currentTarget.form?.requestSubmit() } }}
          />
        <Pressable type="submit" disabled={pending || !hasText} aria-label={COPY.cta.send} className={styles.send}>
          {pending ? <StatusIcon status="loading" /> : <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>}
        </Pressable>
      </form>
    </div>
  )
}
