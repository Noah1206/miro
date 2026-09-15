'use client'
import { useActionState } from 'react'
import { approve, reject, type PayState } from './actions'

/**
 * 한 주문의 승인·거절. 승인은 지급을 일으키므로 되돌리기 어렵다 —
 * 통장에서 확인한 내용을 메모로 남기게 한다.
 */
export function DecisionPanel({ orderId, canAct }: { orderId: string; canAct: boolean }) {
  const [approveState, approveAction, approving] = useActionState(approve, { message: null, ok: false } satisfies PayState)
  const [rejectState, rejectAction, rejecting] = useActionState(reject, { message: null, ok: false } satisfies PayState)
  const state = approveState.message ? approveState : rejectState
  if (!canAct) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>승인 권한 없음</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
      {state.message && <p role="alert" data-pay-result={state.ok ? 'ok' : 'fail'} style={{ fontSize: 12.5, margin: 0, color: state.ok ? '#8fd3a8' : '#E05A7A' }}>{state.message}</p>}
      <form action={approveAction} style={{ display: 'flex', gap: 6 }}>
        <input type="hidden" name="orderId" value={orderId} />
        <input name="note" placeholder="입금 확인 메모" style={{ flex: 1 }} />
        <button type="submit" disabled={approving || rejecting} className="btn" data-approve>승인</button>
      </form>
      <form action={rejectAction} style={{ display: 'flex', gap: 6 }}>
        <input type="hidden" name="orderId" value={orderId} />
        <input name="note" placeholder="거절 사유 (필수)" style={{ flex: 1 }} />
        <button type="submit" disabled={approving || rejecting} className="btn btn-danger" data-reject>거절</button>
      </form>
    </div>
  )
}
