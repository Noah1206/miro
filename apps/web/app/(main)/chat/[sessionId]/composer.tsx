'use client'

import { useActionState, useEffect, useRef } from 'react'
import { sendTurn, setOutputStyle, type TurnState } from './actions'

const initial: TurnState = { error: null, notice: null }

/**
 * 자유 RP 입력.
 * 선택지를 강제하지 않는다 — 대사·행동·묘사·상황 지시를 자유롭게 섞어 쓴다.
 */
export function ChatComposer({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(sendTurn, initial)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!pending && !state.error) ref.current?.reset()
  }, [pending, state.error])

  return (
    <div style={{
      position: 'sticky', bottom: 0, background: 'var(--bg)',
      borderTop: '1px solid var(--border)', padding: '12px 16px',
      paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
    }}>
      {state.notice && (
        <p role="status" style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
          ⚠ {state.notice}
        </p>
      )}
      {state.error && (
        <p role="alert" style={{ fontSize: 12.5, color: 'var(--accent-strong)', margin: '0 0 8px' }}>
          {state.error}
        </p>
      )}

      <form ref={ref} action={action} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <textarea
          name="input" rows={1} required maxLength={2000}
          placeholder="대사, 행동, 묘사를 자유롭게…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
          style={{
            flex: 1, padding: '12px 14px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 12,
            color: 'var(--text-primary)', fontSize: 14.5, fontFamily: 'inherit',
            resize: 'none', lineHeight: 1.5, maxHeight: 140,
          }}
        />
        <button type="submit" disabled={pending} aria-label="전송" style={{
          width: 44, height: 44, flexShrink: 0, border: 'none', borderRadius: 12,
          background: 'var(--accent)', color: 'var(--text-primary)',
          fontSize: 16, cursor: pending ? 'wait' : 'pointer', opacity: pending ? 0.5 : 1,
        }}>
          {pending ? '…' : '↑'}
        </button>
      </form>
    </div>
  )
}

const STYLES = [
  { key: 'messenger', label: '메신저형' },
  { key: 'balanced', label: '균형형' },
  { key: 'narrative', label: '서사형' },
] as const

/** n29 — 출력 스타일 변경. */
export function StylePicker({ sessionId, current }: { sessionId: string; current: string }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {STYLES.map((s) => (
        <form key={s.key} action={setOutputStyle.bind(null, sessionId, s.key)}>
          <button type="submit" aria-pressed={current === s.key} style={{
            padding: '5px 8px', fontSize: 10.5, borderRadius: 7, cursor: 'pointer',
            border: `1px solid ${current === s.key ? 'var(--accent)' : 'var(--border)'}`,
            background: current === s.key ? 'var(--elevated)' : 'transparent',
            color: current === s.key ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}>
            {s.label}
          </button>
        </form>
      ))}
    </div>
  )
}
