'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { requestPhoto, type MediaState } from './media-actions'

const initial: MediaState = { error: null, notice: null }

export function MediaBar({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(requestPhoto, initial)

  return (
    <div style={{ padding: '0 16px 4px' }}>
      {state.error && (
        <p role="alert" style={{ fontSize: 12, color: 'var(--accent-strong)', margin: '0 0 6px' }}>
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
          ⚠ {state.notice}
        </p>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <form action={action}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <button type="submit" disabled={pending} style={pill}>
            {pending ? '사진 요청 중…' : '사진'}
          </button>
        </form>
        <Link href={`/live/${sessionId}`} style={pill}>Live Scene</Link>
      </div>
    </div>
  )
}

const pill: React.CSSProperties = {
  display: 'inline-block', padding: '7px 13px', borderRadius: 999,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
}
