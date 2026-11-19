'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, TransitionLink } from '@/components/ui'
import { useWallet } from '@/components/wallet/provider'
import type { WalletSnapshot } from '@/lib/wallet/types'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import styles from './my.module.css'
import { ProfileIcon } from './profile-icon'

/** 숫자가 바뀌면 0.6초 동안 빠르게 세어 올라간다(11/19 출석 — 토큰이 차는 게 보이게). */
function useCountUp(target: number) {
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = from.current, t0 = performance.now()
    if (start === target) return
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 600), eased = 1 - (1 - p) ** 3
      const v = Math.round(start + (target - start) * eased)
      from.current = v; setShown(v)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return shown
}

/** Real wallet overview; 11/19 카드 전체를 누르면 토큰 페이지(사용 내역·쿠폰)로. 충전·이용권 토큰 칸은 뺐다. */
export function CreditCard({ initial }: { initial: WalletSnapshot }) {
  const { wallet, seed, openRecharge, busy, live } = useWallet()
  const t = useT()
  const router = useRouter()
  const locale = INTL_LOCALE[useLanguage()]
  useEffect(() => { seed(initial) }, [initial, seed])
  const value = wallet ?? initial
  const shown = useCountUp(value.available)
  const go = (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest('a, button')) router.push('/my/subscription') }
  return (
    <section className={`${styles.credit} ${styles.pressCard}`} aria-label={t('미로 토큰')} onClick={go}>
      <div className={styles.creditHeader}>
        <h2>{t('보유 토큰')}</h2>
        <TransitionLink href="/my/subscription" className={styles.historyLink}>{t('사용 내역')}<ProfileIcon name="chevron" size={14} /></TransitionLink>
      </div>
      <div className={styles.creditMain} style={{ marginBottom: 2 }}>
      <p className={styles.balance} aria-live="polite">
        {/* MIRO 로고 형태를 유지한 라벤더 토큰 심볼. */}
        <img src="/miro-token.svg" alt="" aria-hidden width={30} height={30} decoding="async" />
        <span data-profile-balance={value.available} data-wallet-live={live} data-wallet-observed-at={value.observedAt}>{shown.toLocaleString(locale)}</span><span className="sr-only">{t('미로 토큰')}</span>
      </p>
      <Button type="button" variant="primary" size="sm" className={styles.chargeButton} style={{ borderRadius: 8, fontSize: 15 }} onClick={openRecharge} status={busy ? 'loading' : 'idle'}>{t('충전하기')}</Button>
      </div>
    </section>
  )
}
