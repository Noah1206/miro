'use client'
import { useActionState } from 'react'
import { Button, Checkbox, Field, Input } from '@/components/ui'
import { verifyAdult, type VerifyState } from './actions'
import { useT } from '@/lib/i18n/client'
export function VerifyForm() {
  const [state, action, pending] = useActionState(verifyAdult, { error: null, done: false } satisfies VerifyState)
  const t = useT()
  if (state.done) return <p data-verified className="t-body" style={{ padding: 16, background: 'var(--color-surface-1)', border: '1px solid var(--color-white)', borderRadius: 'var(--radius-md)' }}>{t('인증이 완료되었습니다.')}</p>
  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <Field label={t('생년월일')}><Input name="birthDate" type="date" required /></Field>
      <Checkbox name="agree" label={t('성인 콘텐츠 사용 정책에 동의합니다. 실존 인물·지인 기반 성적 표현을 요청하지 않겠습니다.')} />
      {state.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(state.error)}</p>}
      <Button type="submit" variant="primary" size="lg" full status={pending ? 'loading' : 'idle'}>{pending ? t('확인 중') : t('인증하기')}</Button>
    </form>
  )
}
