'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Checkbox, Sheet, useLoginSheet, useToast } from '@/components/ui'
import { AdultVerificationPanel } from '@/components/adult-verification-panel'
import { adultVerificationState } from '@/app/(main)/my/verify/actions'
import { setHomeUnveil } from '@/app/(main)/home/actions'
import { useT } from '@/lib/i18n/client'

/**
 * 언베일 켜기 흐름 — 로그인 → 최초 1회 성인 본인인증 → 정책 동의 → 켜짐. 홈 토글과 흐린 사진(11/4)이 같이 쓴다.
 * returnTo 는 모바일 본인인증 창이 돌아올 주소(`…?unveil=enable`, my/verify/return 이 받아 켠다).
 */
export function useUnveilEnable({ signedIn, returnTo, onChange }: { signedIn: boolean; returnTo: string; onChange?: (enabled: boolean) => void }) {
  const t = useT(), toast = useToast(), login = useLoginSheet(), router = useRouter()
  const [pending, start] = useTransition()
  const [verification, setVerification] = useState<Awaited<ReturnType<typeof adultVerificationState>> | null>(null)
  const [policy, setPolicy] = useState(false)
  const apply = (next: boolean, agreed = false) => {
    if (!signedIn) { login(returnTo.split('?')[0]!); return }
    start(async () => {
      try {
        const result = await setHomeUnveil(next, agreed)
        if (result.ok) { onChange?.(result.enabled); setVerification(null); setPolicy(false); router.refresh(); return }
        if (result.reason === 'verification') setVerification(await adultVerificationState())
        else if (result.reason === 'policy') setPolicy(true)
        else toast(t(result.error))
      } catch { toast(t('변경하지 못했어요. 다시 시도해 주세요.')) }
    })
  }
  const sheets = <>
    <Sheet open={verification !== null} onClose={() => setVerification(null)} title={t('최초 1회 성인 인증')}>
      <div className="stack" style={{ gap: 16, padding: '0 var(--gutter) var(--space-5)' }}>
        <p>{t('인증을 마치면 언베일로 전환돼요. 다음부터는 토글만으로 켜고 끌 수 있어요.')}</p>
        {verification && <AdultVerificationPanel state={verification} returnTo={returnTo} onDone={() => apply(true, true)} />}
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
  return { apply, pending, sheets }
}

/** 흐린 사진 위 누름 칸(11/4) — 누르면 언베일 켜기 흐름. 언베일이 켜지면 새로고침으로 흐림이 사라진다. */
export function UnveilUnlock({ signedIn, returnTo }: { signedIn: boolean; returnTo: string }) {
  const t = useT()
  const { apply, pending, sheets } = useUnveilEnable({ signedIn, returnTo })
  return <>
    <button type="button" disabled={pending} onClick={() => apply(true)} aria-label={t('19세 이상 본인인증하고 보기')}
      style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '18%', border: 0, background: 'transparent', color: '#fff', font: 'inherit', fontSize: 13, cursor: 'pointer' }}>
      <span style={{ padding: '6px 12px', borderRadius: 999, background: 'rgb(0 0 0 / .45)' }}>{t('19세 이상 본인인증하고 보기')}</span>
    </button>
    {sheets}
  </>
}
