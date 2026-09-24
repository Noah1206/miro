'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Input, Pressable, StatusIcon } from '@/components/ui'
import { tween } from '@/lib/motion/tokens'
import { callTurn, hangUp, type CallTurnState } from './actions'

export function CallComposer({ callId }: { callId: string }) {
  const [state, action, pending] = useActionState(callTurn, { error: null } satisfies CallTurnState)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (!pending && !state.error) ref.current?.reset() }, [pending, state.error])
  return (
    <div style={{ padding: '0 var(--space-4) 8px', maxWidth: 560, width: '100%', margin: '0 auto' }}>
      <AnimatePresence>{state.error && <motion.p key="e" role="alert" className="t-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween.fast} style={{ color: 'var(--color-danger)', marginBottom: 8 }}>{state.error}</motion.p>}</AnimatePresence>
      <form ref={ref} action={action} style={{ display: 'flex', gap: 8 }}>
        <input type="hidden" name="callId" value={callId} />
        <Input name="input" required maxLength={500} placeholder="말하기…" aria-label="통화 중 말하기" autoComplete="off" style={{ borderRadius: 'var(--radius-button)', background: 'rgba(17,17,19,0.85)' }} />
        <Pressable type="submit" disabled={pending} aria-label="말하기" style={{ width: 46, height: 46, borderRadius: 999, background: 'var(--color-surface-3)', color: 'var(--color-text-primary)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          {pending ? <StatusIcon status="loading" /> : <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>}
        </Pressable>
      </form>
    </div>
  )
}

/** 마운트된 통화 화면 수. 개발 모드의 이중 마운트는 곧바로 다시 붙으므로 0 일 때만 떠난 것으로 본다. */
const mounted = new Map<string, number>()

export function HangUp({ callId }: { callId: string }) {
  const [sec, setSec] = useState(0)
  useEffect(() => { const t = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(t) }, [])
  // 종료 버튼 없이 떠나도(창 닫기·뒤로 가기) 실제 통화 시간으로 끝낸다. 없으면 정리 크론이 끊긴 통화로 처리한다.
  useEffect(() => {
    const end = () => navigator.sendBeacon(`/api/calls/${callId}/end`)
    mounted.set(callId, (mounted.get(callId) ?? 0) + 1)
    window.addEventListener('pagehide', end)
    return () => {
      window.removeEventListener('pagehide', end)
      mounted.set(callId, (mounted.get(callId) ?? 1) - 1)
      setTimeout(() => { if (!mounted.get(callId)) end() }, 0)
    }
  }, [callId])
  return (
    <form action={hangUp.bind(null, callId)} style={{ padding: '8px 16px 28px', textAlign: 'center' }}>
      <p data-call-timer className="t-micro" aria-label="통화 시간" style={{ marginBottom: 14, fontVariantNumeric: 'tabular-nums' }}>{String(Math.floor(sec / 60)).padStart(2, '0')}:{String(sec % 60).padStart(2, '0')}</p>
      <Pressable type="submit" aria-label="종료" style={{ width: 68, height: 68, borderRadius: 999, border: 0, background: 'var(--color-danger-strong)', color: '#fff', fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-semibold)' }}>종료</Pressable>
    </form>
  )
}
