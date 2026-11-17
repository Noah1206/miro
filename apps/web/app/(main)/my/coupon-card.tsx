'use client'
import { useState, useTransition } from 'react'
import { REFERRAL_GRANT } from '@miro/config'
import { Button } from '@/components/ui'
import { useWallet } from '@/components/wallet/provider'
import type { MyReferral } from '@/lib/referral'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import { claimCoupon } from './actions'
import styles from './my.module.css'

/**
 * 11/18 쿠폰·추천인 코드 — 출석 체크 바로 밑, 열지 않아도 보이는 입력 칸(이벤트 쿠폰이나 친구의 추천인 코드).
 * 아래에는 내 추천인 코드와 복사 버튼. 받으면 지갑 잔액을 다시 읽는다.
 */
export function CouponCard({ referral, initialCode = null }: { referral: MyReferral; initialCode?: string | null }) {
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const { refreshBalance } = useWallet()
  const [code, setCode] = useState(initialCode ?? '')
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()
  const n = (v: number) => v.toLocaleString(locale)
  const errors: Record<string, string> = {
    empty: t('쿠폰 코드를 입력해 주세요.'), unknown: t('없는 쿠폰 코드예요.'), closed: t('마감된 쿠폰이에요.'), used: t('이미 받은 쿠폰이에요.'),
    self: t('내 추천인 코드는 넣을 수 없어요.'), too_late: t('추천인 코드는 가입 후 {days}일 안에만 넣을 수 있어요.', { days: REFERRAL_GRANT.joinWindowDays }),
    referred: t('이미 추천인 코드를 넣었어요.'),
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      setNotice(null)
      try {
        const r = await claimCoupon(code)
        if (r.ok) {
          setNotice({ ok: true, text: t('{amount}토큰을 받았어요 · {days}일 동안 쓸 수 있어요', { amount: n(r.units), days: r.validDays }) })
          setCode('')
          void refreshBalance(true)
        } else setNotice({ ok: false, text: errors[r.error] ?? errors.unknown! })
      } catch { setNotice({ ok: false, text: t('쿠폰을 받지 못했어요. 다시 시도해 주세요.') }) }
    })
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(referral.code); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* 복사를 막은 브라우저 — 코드는 화면에 그대로 보인다 */ }
  }
  // 11/18 내 초대 링크 공유(/r/<내 코드>) — 친구가 이 링크로 가입하면 추천이 자동으로 적용된다. 공유 창이 없으면 링크를 복사.
  const share = async () => {
    const url = `${location.origin}/r/${referral.code}`
    try {
      if (navigator.share) { await navigator.share({ title: t('미로 — 음성 캐릭터챗'), text: t('캐릭터 대사를 목소리로 듣는 미로! 이 링크로 들어오면 무료 토큰을 받아요.'), url }); return }
    } catch { return /* 공유 창을 닫음 */ }
    try { await navigator.clipboard.writeText(url); setNotice({ ok: true, text: t('초대 링크를 복사했어요') }) } catch { setNotice({ ok: true, text: url }) }
  }
  return (
    <section id="coupon" className={styles.credit} aria-label={t('쿠폰·추천인 코드')} style={{ marginTop: 12, scrollMarginTop: 80 }}>
      <div className={styles.creditHeader}><h2>{t('쿠폰·추천인 코드')}</h2></div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input value={code} onChange={e => setCode(e.target.value)} aria-label={t('쿠폰 코드')} placeholder={t('쿠폰 또는 추천인 코드 입력')} maxLength={40} autoCapitalize="characters" autoComplete="off" spellCheck={false}
          style={{ flex: 1, minWidth: 0, height: 40, padding: '0 12px', borderRadius: 8, border: 0, outline: 'none', background: 'var(--profile-control)', color: 'inherit', fontSize: 15, letterSpacing: '.04em' }} />
        <button type="button" onClick={() => void share()} aria-label={t('내 초대 링크 공유')} title={t('내 초대 링크 공유')}
          style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 8, border: 0, background: 'var(--profile-control)', color: 'inherit', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
        </button>
        <Button type="submit" variant="primary" size="sm" className={styles.chargeButton} status={pending ? 'loading' : 'idle'} disabled={!code.trim()}
          style={{ borderRadius: 8, fontSize: 15, background: '#fff', color: '#111015', borderColor: '#fff', flexShrink: 0 }}>{t('받기')}</Button>
      </form>
      {notice && <p role="status" style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.5, color: notice.ok ? 'var(--profile-muted)' : 'var(--color-danger, #ff6b6b)' }}>{notice.text}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--profile-control)' }}>
        <span style={{ fontSize: 12, color: 'var(--profile-muted)' }}>{t('내 추천인 코드')}</span>
        <strong style={{ fontSize: 16, letterSpacing: '.08em', flex: 1 }}>{referral.code}</strong>
        <button type="button" onClick={() => void copy()} style={{ border: 0, background: 'transparent', color: 'inherit', fontSize: 13, fontWeight: 650, cursor: 'pointer', padding: 4 }}>
          {copied ? t('복사됨') : t('복사')}
        </button>
      </div>
      <p style={{ margin: '8px 0 0', color: 'var(--profile-muted)', fontSize: 12, lineHeight: 1.5 }}>
        {t('친구가 내 코드를 넣으면 친구는 {friend}토큰, 친구가 대화를 {turns}턴 하면 나는 {me}토큰을 받아요.', { friend: n(REFERRAL_GRANT.referee), turns: REFERRAL_GRANT.afterTurns, me: n(REFERRAL_GRANT.referrer) })}
        {referral.friends > 0 && <> {t('지금까지 친구 {n}명', { n: referral.friends })}</>}
      </p>
    </section>
  )
}
