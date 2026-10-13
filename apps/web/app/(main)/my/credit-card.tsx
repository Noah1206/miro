'use client'
import { useEffect } from 'react'
import { Button } from '@/components/ui'
import { useWallet } from '@/components/wallet/provider'
import type { WalletSnapshot } from '@/lib/wallet/types'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import styles from './my.module.css'

const OUTLINE = { background: 'transparent', border: '1px solid var(--color-border-strong)' } as const

/** '나' 화면의 크레딧 카드(2026-09-30, WHIF 프로필 모양) — 잔액 한 줄, 충전(충전 시트). 사용 내역 버튼은 뺐다(2026-10-01) — Miro Pay 화면은 채팅 모델 선택에서 간다. */
export function CreditCard({ initial }: { initial: WalletSnapshot }) {
  const { wallet, sync, openRecharge, busy } = useWallet()
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  useEffect(() => { sync(initial) }, [initial, sync])
  const value = wallet ?? initial
  return (
    <section className={styles.credit} aria-label={t('미로 토큰')}>
      <p className={styles.balance} aria-live="polite">
        {/* MIRO 로고 형태를 유지한 라벤더 토큰 심볼. */}
        <img src="/miro-token.svg" alt="" aria-hidden width={26} height={26} decoding="async" style={{ display: 'block' }} />
        {t('{n} 미로 토큰', { n: value.available.toLocaleString(locale) })}
      </p>
      <div className={styles.creditActions}>
        <Button type="button" full style={OUTLINE} onClick={openRecharge} status={busy ? 'loading' : 'idle'}>{t('충전')}</Button>
      </div>
    </section>
  )
}
