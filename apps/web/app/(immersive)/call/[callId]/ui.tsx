'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { callTurn, hangUp, type CallTurnState } from './actions'

export function CallComposer({ callId }: { callId: string }) {
  const [state, action, pending] = useActionState(callTurn, { error: null } satisfies CallTurnState)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (!pending && !state.error) ref.current?.reset() }, [pending, state.error])

  return (
    <div style={{ padding: '0 16px 8px' }}>
      {state.error && <p role="alert" style={{ fontSize: 12.5, color: 'var(--accent-strong)', margin: '0 0 8px' }}>{state.error}</p>}
      <form ref={ref} action={action} style={{ display: 'flex', gap: 8 }}>
        <input type="hidden" name="callId" value={callId} />
        <input name="input" required maxLength={500} placeholder="말하기…" autoComplete="off" style={{
          flex: 1, padding: '12px 14px', borderRadius: 999, background: 'rgba(23,23,26,.9)',
          border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14.5,
        }} />
        <button type="submit" disabled={pending} aria-label="말하기" style={{
          width: 44, height: 44, borderRadius: 999, border: 'none', background: 'var(--elevated)',
          color: 'var(--text-primary)', cursor: pending ? 'wait' : 'pointer', opacity: pending ? .5 : 1,
        }}>{pending ? '…' : '↑'}</button>
      </form>
    </div>
  )
}

export function HangUp({ callId }: { callId: string }) {
  const [sec, setSec] = useState(0)
  useEffect(() => { const t = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(t) }, [])
  return (
    <form action={hangUp.bind(null, callId)} style={{ padding: '8px 16px 28px', textAlign: 'center' }}>
      <p data-call-timer style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
        {String(Math.floor(sec / 60)).padStart(2, '0')}:{String(sec % 60).padStart(2, '0')}
      </p>
      <button type="submit" style={{
        width: 64, height: 64, borderRadius: 999, border: 'none', background: '#D9363E',
        color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}>종료</button>
    </form>
  )
}
