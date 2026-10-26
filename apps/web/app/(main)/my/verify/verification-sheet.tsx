'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui'
import { AdultVerificationPanel } from '@/components/adult-verification-panel'
import { useT } from '@/lib/i18n/client'
import { adultVerificationState } from './actions'
import { MenuItemContent } from '../menu'
import styles from '../my.module.css'

type State = Awaited<ReturnType<typeof adultVerificationState>>

/** Opens on the profile itself; the identity provider starts only after consent and submission. */
export function VerificationSheet({ initiallyVerified, autoOpen = false, result }: { initiallyVerified: boolean; autoOpen?: boolean; result?: string }) {
  const router = useRouter()
  const t = useT()
  const [open, setOpen] = useState(autoOpen)
  const [state, setState] = useState<State | null>(null)
  const [verified, setVerified] = useState(initiallyVerified)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => { if (autoOpen) setOpen(true) }, [autoOpen])
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setFailed(false)
    setState(null)
    adultVerificationState().then(value => {
      if (!cancelled) { setState(value); setVerified(value.verified) }
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [open, attempt])

  const close = useCallback(() => {
    setOpen(false)
    if (autoOpen) router.replace('/my', { scroll: false })
  }, [autoOpen, router])
  const done = useCallback(() => { setVerified(true); router.refresh() }, [router])

  return <>
    <button type="button" className={styles.row} onClick={() => setOpen(true)} aria-haspopup="dialog">
      <MenuItemContent label={t('성인 인증')} end={t(verified ? '인증 완료' : '인증하기')} icon="shield" />
    </button>
    <Sheet open={open} onClose={close} label={t('성인 인증')} compact>
      <h2 style={{ margin: '14px 40px 24px 0', fontSize: 18, fontWeight: 450, lineHeight: 1.3, letterSpacing: '-.025em' }}>{t('성인 인증')}</h2>
      {state && verified ? <div className="stack" style={{ gap: 20 }}>
        <p data-verified role="status">{t('인증이 완료되었습니다.')}</p>
        <Button full onClick={close}>{t('확인')}</Button>
      </div> : failed ? <div className="stack" style={{ gap: 16 }}>
        <p role="alert" className="t-caption">{t('인증 정보를 불러오지 못했어요.')}</p>
        <Button onClick={() => setAttempt(value => value + 1)}>{t('다시 시도')}</Button>
      </div> : state ? <>
        {result === 'cancelled' && <p role="status" className="t-caption" style={{ marginBottom: 16 }}>{t('본인인증을 마치지 않았어요.')}</p>}
        {result === 'failed' && <p role="alert" className="t-caption" style={{ marginBottom: 16 }}>{t('본인인증 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')}</p>}
        <AdultVerificationPanel state={state} onDone={done} returnTo="/my" />
      </> : <p role="status" className="t-caption" style={{ paddingBottom: 20 }}>{t('불러오는 중')}</p>}
    </Sheet>
  </>
}
