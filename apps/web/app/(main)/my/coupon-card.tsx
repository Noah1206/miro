'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui'
import { useWallet } from '@/components/wallet/provider'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import { claimCoupon } from './actions'
import styles from './my.module.css'

/** 11/18 이벤트 쿠폰 — 출석 체크 바로 밑, 열지 않아도 보이는 입력 칸. 받으면 지갑 잔액을 다시 읽는다. */
export function CouponCard() {
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const { refreshBalance } = useWallet()
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const [pending, start] = useTransition()
  const errors = { empty: t('쿠폰 코드를 입력해 주세요.'), unknown: t('없는 쿠폰 코드예요.'), closed: t('마감된 쿠폰이에요.'), used: t('이미 받은 쿠폰이에요.') }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      setNotice(null)
      try {
        const r = await claimCoupon(code)
        if (r.ok) {
          setNotice({ ok: true, text: t('{amount}토큰을 받았어요 · {days}일 동안 쓸 수 있어요', { amount: r.units.toLocaleString(locale), days: r.validDays }) })
          setCode('')
          void refreshBalance(true)
        } else setNotice({ ok: false, text: errors[r.error] })
      } catch { setNotice({ ok: false, text: t('쿠폰을 받지 못했어요. 다시 시도해 주세요.') }) }
    })
  }
  return (
    <section className={styles.credit} aria-label={t('쿠폰')} style={{ marginTop: 12 }}>
      <div className={styles.creditHeader}><h2>{t('쿠폰')}</h2></div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input value={code} onChange={e => setCode(e.target.value)} aria-label={t('쿠폰 코드')} placeholder={t('쿠폰 코드 입력')} maxLength={40} autoCapitalize="characters" autoComplete="off" spellCheck={false}
          style={{ flex: 1, minWidth: 0, height: 40, padding: '0 12px', borderRadius: 8, border: 0, outline: 'none', background: 'var(--profile-control)', color: 'inherit', fontSize: 15, letterSpacing: '.04em' }} />
        <Button type="submit" variant="primary" size="sm" className={styles.chargeButton} status={pending ? 'loading' : 'idle'} disabled={!code.trim()}
          style={{ borderRadius: 8, fontSize: 15, background: '#fff', color: '#111015', borderColor: '#fff', flexShrink: 0 }}>{t('받기')}</Button>
      </form>
      {notice && <p role="status" style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: notice.ok ? 'var(--profile-muted)' : 'var(--color-danger, #ff6b6b)' }}>{notice.text}</p>}
    </section>
  )
}
