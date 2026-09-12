'use client'
import { useActionState } from 'react'
import { verifyAdult, type VerifyState } from './actions'
export function VerifyForm() {
  const [state, action, pending] = useActionState(verifyAdult, { error: null, done: false } satisfies VerifyState)
  if (state.done) return <p data-verified style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 12, fontSize: 14 }}>인증이 완료되었습니다.</p>
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 5 }}>생년월일
        <input name="birthDate" type="date" required style={{ padding: 11, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, colorScheme: 'dark' }} />
      </label>
      <label style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.5 }}><input name="agree" type="checkbox" style={{ accentColor: 'var(--accent)' }} />성인 콘텐츠 사용 정책에 동의합니다. 실존 인물·지인 기반 성적 표현을 요청하지 않겠습니다.</label>
      {state.error && <p role="alert" style={{ color: 'var(--accent-strong)', fontSize: 12.5, margin: 0 }}>{state.error}</p>}
      <button type="submit" disabled={pending} style={{ padding: 14, borderRadius: 12, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>{pending ? '확인 중…' : '인증하기'}</button>
    </form>
  )
}
