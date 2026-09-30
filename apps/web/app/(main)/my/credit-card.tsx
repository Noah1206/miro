'use client'
import { useEffect } from 'react'
import { TransitionLink } from '@/components/ui'
import { useWallet } from '@/components/wallet/provider'
import type { WalletSnapshot } from '@/lib/wallet/types'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import styles from './my.module.css'

/** '나' 화면의 크레딧 카드(2026-09-30, WHIF 프로필 모양) — 잔액 한 줄, 사용 내역(Miro Pay 화면) · 충전(충전 시트). */
export function CreditCard({ initial }: { initial: WalletSnapshot }) {
  const { wallet, sync, openRecharge, busy } = useWallet()
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  useEffect(() => { sync(initial) }, [initial, sync])
  const value = wallet ?? initial
  return (
    <section className={styles.credit} aria-label={t('크레딧')}>
      <p className={styles.balance} aria-live="polite">
        <svg aria-hidden width="26" height="26" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#F5B83D" /><circle cx="12" cy="12" r="6.6" fill="none" stroke="#FFE08A" strokeWidth="1.6" /><path d="M12 8.2v7.6M9.6 10.4h4.8" stroke="#A8680C" strokeWidth="1.7" strokeLinecap="round" /></svg>
        {t('{n} 크레딧', { n: value.rechargeRemaining.toLocaleString(locale) })}
      </p>
      <div className={styles.creditActions}>
        <TransitionLink href="/recharge" className={styles.outline}>{t('사용 내역')}</TransitionLink>
        <button type="button" className={styles.solid} onClick={openRecharge} disabled={busy}>
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          {t('충전')}
        </button>
      </div>
    </section>
  )
}
