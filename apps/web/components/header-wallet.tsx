'use client'
import { useEffect } from 'react'
import { useWallet } from '@/components/wallet/provider'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'

/** 11/10 헤더의 남은 토큰 — 누르면 충전 시트. 홈·대화방 헤더가 같이 쓴다. */
export function HeaderWallet() {
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const { wallet, refreshBalance, openRecharge } = useWallet()
  useEffect(() => { if (!wallet) void refreshBalance() }, [wallet, refreshBalance])
  return (
    <button type="button" onClick={openRecharge} aria-label={`${t('남은 토큰')} ${wallet ? wallet.available.toLocaleString(locale) : ''} · ${t('충전하기')}`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px 0 8px', marginRight: 4, borderRadius: 16, border: '1px solid var(--color-border)', background: 'var(--color-surface-1)', color: 'var(--color-text-primary)', font: 'inherit', fontSize: 13, fontWeight: 650, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <img src="/miro-token.svg" alt="" aria-hidden width={16} height={16} decoding="async" />
      <span data-header-balance={wallet?.available}>{wallet ? wallet.available.toLocaleString(locale) : '—'}</span>
      <span aria-hidden style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>＋</span>
    </button>
  )
}
