'use client'
import { useActionState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import { testPush, type TestPushState } from './actions'
import { useT } from '@/lib/i18n/client'

export function TestPushButton() {
  const [state, action] = useActionState(testPush, { message: null, ok: false } satisfies TestPushState)
  const t = useT()
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <SubmitButton size="sm" variant="secondary" data-test-push>{t('테스트 알림 보내기')}</SubmitButton>
      {state.message && <p role="status" data-test-push-result={state.ok ? 'ok' : 'fail'} className="t-caption" style={{ color: state.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{t(state.message)}</p>}
    </form>
  )
}
