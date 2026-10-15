'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Checkbox, Sheet, Switch, useLoginSheet, useToast } from '@/components/ui'
import { AdultVerificationPanel } from '@/components/adult-verification-panel'
import { adultVerificationState } from '@/app/(main)/my/verify/actions'
import { setHomeUnveil } from './actions'
import { useT } from '@/lib/i18n/client'

export function HomeUnveilToggle({ enabled, signedIn }: { enabled: boolean; signedIn: boolean }) {
  const t = useT(), toast = useToast(), login = useLoginSheet(), router = useRouter()
  const [on, setOn] = useState(enabled)
  const [pending, start] = useTransition()
  const [verification, setVerification] = useState<Awaited<ReturnType<typeof adultVerificationState>> | null>(null)
  const [policy, setPolicy] = useState(false)
  const apply = (next: boolean, agreed = false) => {
    if (!signedIn) { login('/home'); return }
    start(async () => {
      try {
        const result = await setHomeUnveil(next, agreed)
        if (result.ok) { setOn(result.enabled); setVerification(null); setPolicy(false); router.refresh(); return }
        if (result.reason === 'verification') setVerification(await adultVerificationState())
        else if (result.reason === 'policy') setPolicy(true)
        else toast(t(result.error))
      } catch { toast(t('변경하지 못했어요. 다시 시도해 주세요.')) }
    })
  }
  return <>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="sr-only">{t('일반과 언베일의 대화·기억은 따로 보관돼요.')}</span>
      <Switch name="home-unveil" label={t('언베일')} checked={on} disabled={pending} onChange={apply} />
    </span>
    <Sheet open={verification !== null} onClose={() => setVerification(null)} title={t('최초 1회 성인 인증')}>
      <div className="stack" style={{ gap: 16, padding: '0 var(--gutter) var(--space-5)' }}>
        <p>{t('인증을 마치면 언베일로 전환돼요. 다음부터는 토글만으로 켜고 끌 수 있어요.')}</p>
        {verification && <AdultVerificationPanel state={verification} returnTo="/home?unveil=enable" onDone={() => apply(true, true)} />}
        <Button type="button" variant="ghost" onClick={() => setVerification(null)}>{t('돌아가기')}</Button>
      </div>
    </Sheet>
    <Sheet open={policy} onClose={() => setPolicy(false)} title={t('언베일')}>
      <form className="stack" style={{ gap: 16, padding: '0 var(--gutter) var(--space-5)' }} onSubmit={event => { event.preventDefault(); apply(true, true) }}>
        <Checkbox name="policy" required label={t('성인 콘텐츠 정책에 동의합니다')} />
        <a href="/terms/adult" target="_blank" rel="noopener">{t('언베일 이용 정책 보기')}</a>
        <Button type="submit" disabled={pending}>{t('동의하고 계속하기')}</Button>
      </form>
    </Sheet>
  </>
}
