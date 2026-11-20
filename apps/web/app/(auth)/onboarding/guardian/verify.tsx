'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'
import { portOne } from '@/lib/portone-sdk'
import { confirmGuardianAction } from './actions'

/** 보호자 본인인증 — 성인 인증 창(my/verify/portone.tsx)과 같은 PortOne 창. 모바일은 /my/verify/return?next=/onboarding/guardian 으로 돌아온다. 개발(Mock)은 보호자 생년월일. */
export function GuardianVerify({ client, prefix }: { client: { storeId: string; channelKey: string } | null; prefix: string }) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const [birthDate, setBirthDate] = useState('')
  const [pending, start] = useTransition()
  const run = () => start(async () => {
    setError(null)
    if (!client) { const r = await confirmGuardianAction({ birthDate }); if (r?.error) setError(r.error); return }
    const identityVerificationId = prefix + crypto.randomUUID().slice(0, 8)
    let res
    try {
      res = await (await portOne()).requestIdentityVerification({ storeId: client.storeId, channelKey: client.channelKey, identityVerificationId,
        redirectUrl: `${location.origin}/my/verify/return?next=${encodeURIComponent('/onboarding/guardian')}` })
    } catch { setError(t(msg('본인인증 창을 열지 못했어요. 잠시 후 다시 시도해 주세요.'))); return }
    if (!res || res.code) { setError(res?.message || t(msg('본인인증을 마치지 않았어요.'))); return }
    const r = await confirmGuardianAction({ identityVerificationId })
    if (r?.error) setError(r.error)
  })
  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); run() }}>
      {!client && <input type="date" required value={birthDate} onChange={e => setBirthDate(e.target.value)} aria-label={t('보호자 생년월일')} />}
      {error && <p role="alert" className="t-caption" style={{ margin: 0, color: 'var(--color-danger)' }}>{error}</p>}
      <Button type="submit" variant="primary" size="lg" full status={pending ? 'loading' : 'idle'} disabled={pending}>{pending ? t('확인 중') : t('보호자 본인인증하기')}</Button>
    </form>
  )
}
