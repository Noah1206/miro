'use client'

import { useActionState, useRef, useEffect } from 'react'
import { liveTurn, type LiveState } from './actions'

const initial: LiveState = { error: null, notice: null }

/**
 * Live Scene 입력.
 *
 * 제안 행동은 힌트일 뿐이며 강제하지 않는다 — 자유 입력을 항상 허용한다
 * (지시서 §16). 제안을 누르면 입력창을 채울 뿐 바로 전송하지 않는다.
 */
export function LiveComposer({ sessionId, characterName }: {
  sessionId: string; characterName: string
}) {
  const [state, action, pending] = useActionState(liveTurn, initial)
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset()
  }, [pending, state.error])

  const suggestions = [
    '가만히 지켜본다.',
    `"${characterName}…"`,
    '한 걸음 다가간다.',
  ]

  return (
    <div style={{
      padding: '12px 16px', background: 'rgba(14,14,16,0.86)',
      borderTop: '1px solid var(--border)',
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

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => {
            if (inputRef.current) {
              inputRef.current.value = s
              inputRef.current.focus()
            }
          }} style={{
            fontSize: 11.5, padding: '6px 11px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-secondary)',
          }}>
            {s}
          </button>
        ))}
      </div>

      <form ref={formRef} action={action} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <textarea
          ref={inputRef} name="input" rows={1} required maxLength={2000}
          placeholder="무엇을 하시겠어요?"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
          style={{
            flex: 1, padding: '12px 14px', background: 'rgba(23,23,26,0.9)',
            border: '1px solid var(--border)', borderRadius: 12,
            color: 'var(--text-primary)', fontSize: 14.5, fontFamily: 'inherit',
            resize: 'none', lineHeight: 1.5, maxHeight: 120,
          }}
        />
        <button type="submit" disabled={pending} aria-label="행동" style={{
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
