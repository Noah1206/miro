'use client'
import { useActionState } from 'react'
import { applyAction, type ActState } from './actions'
const ACTIONS: Array<[string, string, boolean]> = [
  ['start_review', '검토 시작', false], ['hide_content', '콘텐츠 숨김', true], ['restrict_session', '역할극 제한', true],
  ['resolve_no_action', '위반 아님 (종결)', false], ['dismiss', '기각', false], ['reopen', '다시 열기', false],
]
export function ActionPanel({ reportId, version, status }: { reportId: string; version: number; status: string }) {
  const [state, action, pending] = useActionState(applyAction, { message: null, ok: false } satisfies ActState)
  return (
    <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="hidden" name="reportId" value={reportId} /><input type="hidden" name="version" value={version} />
      <h2 style={{ fontSize: 12, letterSpacing: '.1em', color: 'var(--muted)', margin: 0 }}>조치 (현재 {status})</h2>
      <textarea name="note" rows={3} placeholder="검토 메모 · 제한 조치 시 정책 위반 근거 (필수)" />
      {state.message && <p role="alert" data-act-result={state.ok ? 'ok' : 'fail'} style={{ fontSize: 12.5, margin: 0, color: state.ok ? '#8fd3a8' : '#E05A7A' }}>{state.message}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ACTIONS.map(([v, l, danger]) => <button key={v} name="action" value={v} type="submit" disabled={pending} className={`btn ${danger ? 'btn-danger' : ''}`}>{l}</button>)}
      </div>
    </form>
  )
}
