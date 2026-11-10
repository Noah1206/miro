'use client'
import { useActionState } from 'react'
import { paid, reject, type PayoutActionState } from './actions'

export function PayoutPanel({ id, canAct }: { id: string; canAct: boolean }) {
  const [paidState, paidAction, paying] = useActionState(paid, { message: null, ok: false } satisfies PayoutActionState)
  const [rejectState, rejectAction, rejecting] = useActionState(reject, { message: null, ok: false } satisfies PayoutActionState)
  const state = paidState.message ? paidState : rejectState
  if (!canAct) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>권한 없음</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240 }}>
      {state.message && <p role="alert" style={{ fontSize: 12.5, margin: 0, color: state.ok ? '#8fd3a8' : '#E05A7A' }}>{state.message}</p>}
      <form action={paidAction} style={{ display: 'flex', gap: 6 }}>
        <input type="hidden" name="id" value={id} />
        <input name="note" placeholder="송금 메모" style={{ flex: 1 }} />
        <button type="submit" disabled={paying || rejecting} className="btn">송금 완료</button>
      </form>
      <form action={rejectAction} style={{ display: 'flex', gap: 6 }}>
        <input type="hidden" name="id" value={id} />
        <input name="note" placeholder="반려 사유 (필수)" style={{ flex: 1 }} />
        <button type="submit" disabled={paying || rejecting} className="btn btn-danger">반려</button>
      </form>
    </div>
  )
}
