'use client'
import { useActionState } from 'react'
import { Button, Input } from '@/components/ui'
import { YUJIN } from '@/lib/alpha/character'
import { joinWaitlist, type WaitlistState } from '../actions'
import { useT } from '@/lib/i18n/client'

export function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlist, { done: false, error: null } satisfies WaitlistState)
  const t = useT()
  if (state.done) {
    return (
      <section role="status" className="stack" style={{ gap: 8, padding: 'var(--space-5)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)' }}>
        <p className="t-title-3">{t('{name}과의 이야기는 여기서 멈췄어요.', { name: YUJIN.name })}</p>
        <p className="t-body" style={{ color: 'var(--color-text-secondary)' }}>{t('다음 Alpha에서 이어갈 수 있도록 알려드릴게요.')}</p>
      </section>
    )
  }
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <Input name="email" type="email" inputMode="email" autoComplete="email" required placeholder={t('이메일')} aria-label={t('이메일')} />
      {state.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(state.error)}</p>}
      <Button type="submit" variant="primary" size="lg" full status={pending ? 'loading' : 'idle'} disabled={pending}>{t('이 관계 계속하기')}</Button>
      <p className="t-caption" style={{ textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{t('초대 안내 외에는 보내지 않아요.')}</p>
    </form>
  )
}
