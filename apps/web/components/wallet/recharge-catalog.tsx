'use client'
import { useState } from 'react'
import type { RechargeProduct } from '@miro/config'
import { Button, TransitionLink } from '@/components/ui'
import { useLanguage, useT } from '@/lib/i18n/client'
import { INTL_LOCALE } from '@/lib/i18n'
import styles from './recharge-catalog.module.css'

export function RechargeCatalog({ available, products, selected, onSelect, onNext, onClose, busy = false }: {
  available: number; products: RechargeProduct[]; selected: string; onSelect: (id: string) => void;
  onNext: () => void; onClose: () => void; busy?: boolean
}) {
  const t = useT(), locale = INTL_LOCALE[useLanguage()]
  const [expanded, setExpanded] = useState(false)
  const current = products.find(p => `recharge:${p.id}` === selected)
  const shown = expanded ? products : products.slice(0, 3)
  const number = (n: number) => n.toLocaleString(locale)
  const price = (n: number) => t('{n}원', { n: number(n) })
  return <div className={styles.catalog}>
    <div className={styles.balance}>
      <span>{t('보유 토큰')}</span>
      <strong><img src="/miro-token.svg" alt="" width={20} height={20} />{number(available)}<small>{t('미로 토큰')}</small></strong>
    </div>
    <fieldset className={styles.options} disabled={busy}>
      <legend>{t('충전할 금액')}</legend>
      {shown.map(p => <label key={p.id} className={styles.option} data-selected={selected === `recharge:${p.id}`}>
        <input type="radio" name="wallet-product" value={`recharge:${p.id}`} checked={selected === `recharge:${p.id}`} onChange={() => onSelect(`recharge:${p.id}`)} />
        <span className={styles.check} aria-hidden><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 8 3 3 7-7" /></svg></span>
        <span className={styles.quantity}><strong>{number(p.units)}</strong><small>{t('미로 토큰')}</small></span>
        <b>{price(p.priceMinor)}</b>
      </label>)}
      {!products.length && <p>{t('판매 중인 토큰 상품이 없어요.')}</p>}
      {products.length > 3 && <button className={styles.expand} type="button" aria-label={t('금액 더 보기')} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{transform:expanded?'rotate(180deg)':undefined}}><path d="m6 9 6 6 6-6" /></svg></button>}
    </fieldset>
    <p className={styles.note} data-refund-notice>{t('충전한 날부터 7일 안에는 쓰지 않은 토큰을 환불받을 수 있어요. 이미 쓴 토큰은 환불되지 않아요.')} <TransitionLink href="/terms/refund">{t('취소·환불 규정')}</TransitionLink></p>
    <div className={styles.footer}>
      <Button full variant="primary" disabled={!current} status={busy?'loading':'idle'} onClick={onNext} style={{borderRadius:10,minHeight:50}}>{current ? `${price(current.priceMinor)} · ${t('다음으로')}` : t('충전할 금액')}</Button>
      <Button full variant="ghost" size="sm" onClick={onClose} style={{minHeight:36,padding:'4px 12px',fontSize:13}}>{t('나중에')}</Button>
    </div>
  </div>
}
