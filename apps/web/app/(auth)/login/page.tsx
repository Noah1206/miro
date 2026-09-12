'use client'

import { useActionState, useState } from 'react'
import { authenticate, type AuthState } from './actions'

const initial: AuthState = { error: null }

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [state, action, pending] = useActionState(authenticate, initial)

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column',
                   justifyContent: 'center', padding: 24, maxWidth: 420, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, letterSpacing: '0.2em', fontWeight: 300, margin: '0 0 40px' }}>
        MIRO
      </h1>

      <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {(['login', 'signup'] as const).map((m) => (
          <button key={m} role="tab" type="button" aria-selected={mode === m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, padding: '10px', cursor: 'pointer',
              background: mode === m ? 'var(--elevated)' : 'transparent',
              color: mode === m ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: '1px solid var(--border)', borderRadius: 10, fontSize: 14,
            }}>
            {m === 'login' ? '로그인' : '회원가입'}
          </button>
        ))}
      </div>

      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="hidden" name="mode" value={mode} />
        <input name="email" type="email" placeholder="이메일" required autoComplete="email"
          style={inputStyle} />
        <input name="password" type="password" placeholder="비밀번호 (8자 이상)" required
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          style={inputStyle} />

        {state.error && (
          <p role="alert" style={{ color: 'var(--accent-strong)', fontSize: 13, margin: '4px 0 0' }}>
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} style={{
          marginTop: 12, padding: 16, border: 'none', borderRadius: 'var(--radius)',
          background: 'var(--accent)', color: 'var(--text-primary)',
          fontWeight: 600, fontSize: 16, cursor: pending ? 'wait' : 'pointer',
          opacity: pending ? 0.6 : 1,
        }}>
          {pending ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}
        </button>
      </form>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  padding: 14,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontSize: 15,
}
