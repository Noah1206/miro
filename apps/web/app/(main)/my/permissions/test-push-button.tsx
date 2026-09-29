'use client'
import { useActionState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import { testPush, type TestPushState } from './actions'

export function TestPushButton() {
  const [state, action] = useActionState(testPush, { message: null, ok: false } satisfies TestPushState)
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <SubmitButton size="sm" variant="secondary" data-test-push>테스트 알림 보내기</SubmitButton>
      {state.message && <p role="status" data-test-push-result={state.ok ? 'ok' : 'fail'} className="t-caption" style={{ color: state.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{state.message}</p>}
    </form>
  )
}
