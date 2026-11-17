'use client'
import { useEffect, useState, useTransition } from 'react'
import { Button, ButtonLink } from '@/components/ui'
import { useLoginSheet } from '@/components/ui/login-sheet'
import { useWallet } from '@/components/wallet/provider'
import { claimEvent } from './actions'

type Coupon = { units: number; validDays: number; open: boolean; left: number | null } | null
type Props = { code: string; refCode: string | null; signedIn: boolean; received: boolean; myCode: string | null; coupon: Coupon; referral: { friend: number; me: number; turns: number } }

const REF_KEY = 'miro:event-ref'
const n = (v: number) => v.toLocaleString('ko-KR')

/**
 * 11/18 이벤트 페이지 화면 — 받기 버튼 하나. 받으면 바로 아래에 내 추천 링크(복사·공유).
 * 친구 링크(?ref=)는 로그인·가입으로 주소가 바뀌어도 잃지 않게 이 기기에도 적어 둔다.
 */
export function EventClaim({ code, refCode, signedIn, received: initialReceived, myCode: initialCode, coupon, referral }: Props) {
  const ask = useLoginSheet()
  const { refreshBalance } = useWallet()
  const [pending, start] = useTransition()
  const [received, setReceived] = useState(initialReceived)
  const [myCode, setMyCode] = useState(initialCode)
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const [ref, setRef] = useState(refCode)

  useEffect(() => {
    try {
      if (refCode) localStorage.setItem(REF_KEY, refCode)
      else setRef(localStorage.getItem(REF_KEY))
    } catch { /* 저장소를 막은 브라우저 — 주소의 ref 만 쓴다 */ }
  }, [refCode])

  // 서버 화면에는 주소(origin)가 없다 — 그린 뒤에 채워 하이드레이션이 어긋나지 않게.
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(location.origin), [])
  const link = myCode && origin ? `${origin}/e/${encodeURIComponent(code)}?ref=${myCode}` : ''
  const claim = () => {
    if (!signedIn) { ask(`/e/${encodeURIComponent(code)}${ref ? `?ref=${ref}` : ''}`); return }
    start(async () => {
      setNotice(null)
      try {
        const r = await claimEvent(code, ref && ref !== initialCode ? ref : null)
        setMyCode(r.myCode)
        const got = (r.coupon.ok ? r.coupon.units : 0) + (r.referral?.ok ? r.referral.units : 0)
        if (r.coupon.ok || (!r.coupon.ok && r.coupon.error === 'used')) setReceived(true)
        if (got > 0) {
          setNotice({ ok: true, text: `${n(got)} 토큰을 받았어요! 지금 바로 대화할 수 있어요.` })
          try { localStorage.removeItem(REF_KEY) } catch { /* 무시 */ }
          void refreshBalance(true)
        } else if (!r.coupon.ok) {
          setNotice({ ok: false, text: r.coupon.error === 'used' ? '이미 받은 쿠폰이에요.' : r.coupon.error === 'closed' ? '선착순이 마감됐어요. 친구 추천으로 토큰을 받을 수 있어요.' : '없는 쿠폰이에요.' })
        }
      } catch { setNotice({ ok: false, text: '받지 못했어요. 잠시 후 다시 시도해 주세요.' }) }
    })
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* 링크는 화면에 그대로 보인다 */ }
  }
  const share = async () => {
    const data = { title: '미로 — 음성 캐릭터챗', text: `캐릭터 대사를 목소리로 듣는 미로! 이 링크로 가입하면 무료 토큰을 받아요.`, url: link }
    try {
      if (navigator.share) await navigator.share(data)
      else await copy()
    } catch { /* 공유를 닫음 */ }
  }

  const closed = !coupon || !coupon.open
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 120px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/events/open-event.webp" alt="미로 오픈 이벤트 — 무료 토큰 쿠폰과 친구 추천" width={1200} height={630}
        style={{ width: '100%', height: 'auto', borderRadius: 16, display: 'block' }} />
      <section style={{ background: 'var(--color-surface-1, #1a1a1f)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="t-caption" style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>쿠폰 {code}</p>
        <h1 className="t-title-2" style={{ margin: 0 }}>
          {coupon ? <>무료 <span style={{ color: 'var(--color-accent)' }}>{n(coupon.units)} 토큰</span> 받기</> : '이벤트를 찾을 수 없어요'}
        </h1>
        {coupon && <p className="t-body" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          버튼을 누르면 바로 지갑에 들어가요 · 받은 뒤 {coupon.validDays}일 동안 사용{coupon.left !== null && coupon.open ? ` · 남은 수량 ${n(coupon.left)}` : ''}
        </p>}
        {ref && !received && <p className="t-caption" style={{ margin: 0, color: 'var(--color-accent)' }}>친구 추천 링크로 들어왔어요 — 받으면 추천 선물 {n(referral.friend)} 토큰도 함께 받아요.</p>}
        <Button full variant="primary" onClick={claim} status={pending ? 'loading' : 'idle'} disabled={received || (closed && !ref)}>
          {received ? '받기 완료' : !signedIn ? '로그인하고 받기' : closed && ref ? '추천 선물 받기' : closed ? '마감됐어요' : '지금 받기'}
        </Button>
        {notice && <p role="status" className="t-body" style={{ margin: 0, color: notice.ok ? 'var(--color-text-primary)' : 'var(--color-danger, #ff6b6b)' }}>{notice.text}</p>}
        {received && <ButtonLink href="/home" full>대화하러 가기</ButtonLink>}
      </section>

      {myCode && <section style={{ background: 'var(--color-surface-1, #1a1a1f)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="t-title-3" style={{ margin: 0 }}>친구에게 공유하고 더 받기</h2>
        <p className="t-body" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          내 링크로 친구가 가입하면 친구는 {n(referral.friend)} 토큰, 친구가 대화를 {referral.turns}턴 하면 나는 {n(referral.me)} 토큰을 받아요.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input readOnly value={link} aria-label="내 추천 링크" onFocus={e => e.currentTarget.select()}
            style={{ flex: 1, minWidth: 0, height: 44, padding: '0 12px', borderRadius: 10, border: 0, outline: 'none', background: 'var(--color-surface-2, #26262c)', color: 'inherit', fontSize: 14 }} />
          <Button size="sm" onClick={() => void copy()} style={{ flexShrink: 0, minHeight: 44 }}>{copied ? '복사됨' : '복사'}</Button>
          <Button size="sm" variant="primary" onClick={() => void share()} style={{ flexShrink: 0, minHeight: 44 }}>공유</Button>
        </div>
        <p className="t-caption" style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>내 추천인 코드 {myCode} · 프로필에서도 볼 수 있어요</p>
      </section>}
    </main>
  )
}
