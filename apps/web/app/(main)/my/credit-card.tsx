'use client'
import { useEffect } from 'react'
import { Button, TransitionLink } from '@/components/ui'
import { useWallet, useWalletWatch } from '@/components/wallet/provider'
import type { WalletSnapshot } from '@/lib/wallet/types'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import styles from './my.module.css'
import { ProfileIcon } from './profile-icon'

/** Real wallet overview; recharge opens the shared sheet and history uses the existing wallet route. */
export function CreditCard({ initial }: { initial: WalletSnapshot }) {
  const { wallet, seed, openRecharge, busy } = useWallet()
  useWalletWatch()
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  useEffect(() => { seed(initial) }, [initial, seed])
  const value = wallet ?? initial
  return (
    <section className={styles.credit} aria-label={t('미로 토큰')}>
      <div className={styles.creditHeader}>
        <h2>{t('보유 토큰')}</h2>
        <TransitionLink href="/my/subscription" className={styles.historyLink}>{t('사용 내역')}<ProfileIcon name="chevron" size={14} /></TransitionLink>
      </div>
      <div className={styles.creditMain}>
      <p className={styles.balance} aria-live="polite">
        {/* MIRO 로고 형태를 유지한 라벤더 토큰 심볼. */}
        <img src="/miro-token.svg" alt="" aria-hidden width={30} height={30} decoding="async" />
        <span data-profile-balance={value.available}>{value.available.toLocaleString(locale)}</span><span className="sr-only">{t('미로 토큰')}</span>
      </p>
      <Button type="button" variant="primary" size="sm" className={styles.chargeButton} style={{ borderRadius: 8, fontSize: 15 }} onClick={openRecharge} status={busy ? 'loading' : 'idle'}>{t('충전하기')}</Button>
      </div>
      <dl className={styles.balanceDetails}>
        <div><dt>{t('충전 토큰')}</dt><dd>{value.rechargeRemaining.toLocaleString(locale)}</dd></div>
        <div><dt>{t('이용권 토큰')}</dt><dd>{value.monthlyRemaining.toLocaleString(locale)}</dd></div>
      </dl>
    </section>
  )
}
