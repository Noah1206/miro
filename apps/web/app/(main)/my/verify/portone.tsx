'use client'
import { useState, useTransition } from 'react'
import { Button, Checkbox } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { msg } from '@/lib/i18n'
import { confirmIdentity } from './actions'

type PortOneSDK = { requestIdentityVerification(req: Record<string, unknown>): Promise<{ code?: string; message?: string } | undefined> }
let loading: Promise<PortOneSDK> | null = null
/** PortOne V2 브라우저 SDK — 이 화면에서만 필요해 누를 때 한 번 불러온다. */
function portOne(): Promise<PortOneSDK> {
  const w = window as unknown as { PortOne?: PortOneSDK }
  if (w.PortOne) return Promise.resolve(w.PortOne)
  return loading ??= new Promise((ok, fail) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.portone.io/v2/browser-sdk.js'
    s.onload = () => (w.PortOne ? ok(w.PortOne) : fail(new Error('portone_sdk')))
    s.onerror = () => { loading = null; fail(new Error('portone_sdk')) }
    document.head.append(s)
  })
}

/**
 * PortOne 본인인증(10/2). PC 는 창이 닫히면 서버에 확인을 맡기고, 모바일은 창이 /my/verify/return 으로 돌려보낸다.
 * 인증 건 id 는 계정 접두어(prefix)로 만든다 — 서버가 다른 계정의 건을 받지 않는다.
 */
export function PortOneVerify({ storeId, channelKey, prefix, notice }: { storeId: string; channelKey: string; prefix: string; notice: string | null }) {
  const t = useT()
  const [error, setError] = useState(notice)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()
  const run = () => start(async () => {
    setError(null)
    const identityVerificationId = prefix + crypto.randomUUID().slice(0, 8)
    let res
    try {
      res = await (await portOne()).requestIdentityVerification({ storeId, channelKey, identityVerificationId, redirectUrl: `${location.origin}/my/verify/return` })
    } catch { setError(msg('본인인증 창을 열지 못했어요. 잠시 후 다시 시도해 주세요.')); return }
    // 창을 닫았거나 본인확인기관 오류 — 기관이 준 문구가 있으면 그대로 보인다.
    if (!res || res.code) { setError(res?.message || msg('본인인증을 마치지 않았어요.')); return }
    const state = await confirmIdentity(identityVerificationId)
    if (state.done) setDone(true)
    else setError(state.error)
  })
  if (done) return <p data-verified className="t-body" style={{ padding: 16, background: 'var(--color-surface-1)', border: '1px solid var(--color-white)', borderRadius: 'var(--radius-md)' }}>{t('인증이 완료되었습니다.')}</p>
  return (
    <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); run() }}>
      <Checkbox name="agree" required label={t('성인 콘텐츠 사용 정책에 동의합니다. 실존 인물·지인 기반 성적 표현을 요청하지 않겠습니다.')} />
      {error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(error)}</p>}
      <Button type="submit" variant="primary" size="lg" full status={pending ? 'loading' : 'idle'} disabled={pending}>{pending ? t('확인 중') : t('본인인증하기')}</Button>
    </form>
  )
}
