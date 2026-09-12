'use client'
import { useActionState } from 'react'
import { submit, type ReportState } from './actions'
const REASONS = [['safety', '안전 정책 위반'], ['rights', '권리 침해 (초상권·저작권)'], ['harassment', '괴롭힘·혐오'], ['inappropriate', '부적절한 결과'], ['other', '기타']] as const
export function ReportForm({ type, id }: { type: string; id: string }) {
  const [state, action, pending] = useActionState(submit, { error: null } satisfies ReportState)
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input type="hidden" name="type" value={type} /><input type="hidden" name="id" value={id} />
      {REASONS.map(([v, l]) => (
        <label key={v} style={{ display: 'flex', gap: 10, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13.5 }}>
          <input type="radio" name="reason" value={v} required style={{ accentColor: 'var(--accent)' }} />{l}
        </label>
      ))}
      <textarea name="detail" rows={3} maxLength={1000} placeholder="추가 설명 (선택)" style={{ padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'inherit' }} />
      {state.error && <p role="alert" style={{ color: 'var(--accent-strong)', fontSize: 12.5, margin: 0 }}>{state.error}</p>}
      <button type="submit" disabled={pending} style={{ padding: 14, borderRadius: 12, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>{pending ? '접수 중…' : '신고 제출'}</button>
    </form>
  )
}
