'use client'
import { useActionState } from 'react'
import { Button, Radio, TextArea } from '@/components/ui'
import { submit, type ReportState } from './actions'
const REASONS = [['safety', '안전 정책 위반'], ['rights', '권리 침해 (초상권·저작권)'], ['harassment', '괴롭힘·혐오'], ['inappropriate', '부적절한 결과'], ['other', '기타']] as const
export function ReportForm({ type, id }: { type: string; id: string }) {
  const [state, action, pending] = useActionState(submit, { error: null } satisfies ReportState)
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="type" value={type} /><input type="hidden" name="id" value={id} />
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <legend className="t-caption" style={{ marginBottom: 8 }}>신고 사유</legend>
        {REASONS.map(([v, l]) => <Radio key={v} name="reason" value={v} label={l} />)}
      </fieldset>
      <TextArea name="detail" rows={3} maxLength={1000} placeholder="추가 설명 (선택)" aria-label="추가 설명" style={{ marginTop: 6 }} />
      {state.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{state.error}</p>}
      <Button type="submit" variant="primary" size="lg" full status={pending ? 'loading' : 'idle'} style={{ marginTop: 8 }}>{pending ? '접수 중' : '신고 제출'}</Button>
    </form>
  )
}
