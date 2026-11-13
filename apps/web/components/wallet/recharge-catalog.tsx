'use client'
import { useState } from 'react'
import type { RechargeProduct } from '@miro/config'
import { Button, TransitionLink } from '@/components/ui'
import { useLanguage, useT } from '@/lib/i18n/client'
import { INTL_LOCALE } from '@/lib/i18n'
import styles from './recharge-catalog.module.css'

/**
 * 충전 금액 목록(11/3) — 금액이 클수록 그림이 풍성해지고(토큰 → 쌓인 토큰 → 가방 → 가방·선물), 금액 버튼을 누르면 바로 주문으로 넘어간다.
 * '다음으로' 단계는 없다.
 */
export type Buyer = { name: string; phone: string; email: string }
export type PayChoice = { method: 'card'; buyer: Buyer } | { method: 'bank' }
const PHONE_KEY = 'miro:buyer-phone'
const phoneOk = (v: string) => /^01[016789]\d{7,8}$/.test(v.replace(/\D/g, ''))
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export function RechargeCatalog({ available, products, onPick, onClose, busy = false, picking = null, minor = false, card = null, bank = true }: {
  available: number; products: RechargeProduct[]; onPick: (id: string, pay: PayChoice) => void; onClose: () => void; busy?: boolean; picking?: string | null
  /** 11/12 만 19세 미만 — 법정대리인 동의 칸에 체크해야 금액 버튼이 눌린다(서버도 같은 확인). */
  minor?: boolean
  /** 11/13 카드 결제(포트원·NHN KCP) — 있으면 결제 수단을 고른다. 이름·이메일은 계정 값으로 미리 채운다. */
  card?: { name: string; email: string } | null
  /** 계좌이체를 받는지(운영 계좌가 설정됐는지). */
  bank?: boolean
}) {
  const t = useT(), locale = INTL_LOCALE[useLanguage()]
  const [guardian, setGuardian] = useState(false)
  const [method, setMethod] = useState<'card' | 'bank'>(card ? 'card' : 'bank')
  // 휴대폰 번호는 이 기기에만 기억한다(다음 결제 편의) — 서버엔 보내지 않고 결제창으로만 넘긴다.
  const [buyer, setBuyer] = useState<Buyer>(() => {
    let phone = ''
    try { phone = localStorage.getItem(PHONE_KEY) ?? '' } catch { /* 저장소를 못 쓰면 빈 칸 */ }
    return { name: card?.name ?? '', phone, email: card?.email ?? '' }
  })
  const buyerReady = buyer.name.trim().length > 0 && phoneOk(buyer.phone) && emailOk(buyer.email)
  const blocked = (minor && !guardian) || (method === 'card' && !buyerReady)
  const pick = (id: string) => {
    if (method === 'bank') return onPick(id, { method: 'bank' })
    try { localStorage.setItem(PHONE_KEY, buyer.phone) } catch { /* 무시 */ }
    onPick(id, { method: 'card', buyer: { name: buyer.name.trim(), phone: buyer.phone.replace(/\D/g, ''), email: buyer.email.trim() } })
  }
  const field = { minHeight: 40, padding: '0 12px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface-1)', color: 'var(--color-text-primary)', font: 'inherit', fontSize: 14, minWidth: 0 } as const
  const chip = (on: boolean) => ({ flex: 1, minHeight: 38, borderRadius: 999, border: on ? '1.5px solid var(--color-text-primary)' : '1px solid var(--color-border)', background: on ? 'var(--color-surface-2)' : 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer', font: 'inherit', fontSize: 14, fontWeight: on ? 600 : 400 }) as const
  const number = (n: number) => n.toLocaleString(locale)
  const last = Math.max(1, products.length - 1)
  return <div className={styles.catalog}>
    <div className={styles.balance}>
      <span>{t('보유 토큰')}</span>
      <strong><img src="/miro-token.svg" alt="" width={20} height={20} />{number(available)}<small>{t('미로 토큰')}</small></strong>
    </div>
    {minor && <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 0 12px', padding: 12, borderRadius: 12, background: 'var(--color-surface-2)', fontSize: 13, lineHeight: 1.5, cursor: 'pointer' }}>
      <input type="checkbox" checked={guardian} onChange={e => setGuardian(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--color-lavender-500)' }} />
      <span><strong>{t('법정대리인(부모님)의 동의를 받았어요')}</strong><br />
        <span style={{ color: 'var(--color-text-secondary)' }}>{t('만 19세 미만은 법정대리인 동의가 필요해요. 동의 없이 결제한 경우 본인이나 법정대리인이 결제를 취소할 수 있어요.')}</span></span>
    </label>}
    {card && <div style={{ display: 'grid', gap: 10, margin: '0 0 12px' }}>
      {bank && <div role="radiogroup" aria-label={t('결제 수단')} style={{ display: 'flex', gap: 8 }}>
        <button type="button" role="radio" aria-checked={method === 'card'} onClick={() => setMethod('card')} style={chip(method === 'card')}>{t('카드 결제')}</button>
        <button type="button" role="radio" aria-checked={method === 'bank'} onClick={() => setMethod('bank')} style={chip(method === 'bank')}>{t('계좌이체')}</button>
      </div>}
      {method === 'card' && <div style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t('결제창에 필요한 구매자 정보예요. 결제대행사(NHN KCP)로만 전달돼요.')}</span>
        <input value={buyer.name} onChange={e => setBuyer(b => ({ ...b, name: e.target.value }))} maxLength={30} autoComplete="name" placeholder={t('이름')} aria-label={t('구매자 이름')} style={field} />
        <input value={buyer.phone} onChange={e => setBuyer(b => ({ ...b, phone: e.target.value }))} maxLength={13} inputMode="tel" autoComplete="tel" placeholder={t('휴대폰 번호 (- 없이)')} aria-label={t('구매자 휴대폰 번호')} aria-invalid={!!buyer.phone && !phoneOk(buyer.phone)} style={field} />
        <input value={buyer.email} onChange={e => setBuyer(b => ({ ...b, email: e.target.value }))} maxLength={100} type="email" autoComplete="email" placeholder={t('이메일')} aria-label={t('구매자 이메일')} aria-invalid={!!buyer.email && !emailOk(buyer.email)} style={field} />
      </div>}
    </div>}
    <ul className={styles.options} aria-label={t('충전할 금액')}>
      {products.map((p, i) => {
        const id = `recharge:${p.id}`
        return <li key={p.id} className={styles.option}>
          <TokenArt tier={products.length === 1 ? 0 : Math.round(i * 4 / last)} />
          <span className={styles.quantity}><strong>{number(p.units)}</strong><small>{t('미로 토큰')}</small>
            {/* 11/12 첫 구매 할인이 걸린 상품에 할인율 태그 */}
            {p.firstPriceMinor && <><i className={styles.break} aria-hidden /><em className={styles.tag}>{t('{n}% 할인', { n: Math.round((1 - p.firstPriceMinor / p.priceMinor) * 100) })}</em><s className={styles.was}>{t('{n}원', { n: number(p.priceMinor) })}</s></>}</span>
          <button type="button" className={styles.price} value={id} disabled={busy || blocked} aria-busy={picking === id} onClick={() => pick(id)}
            aria-label={t('{units} 미로 토큰을 {price}에 충전', { units: number(p.units), price: t('{n}원', { n: number(p.firstPriceMinor ?? p.priceMinor) }) })}>
            {picking === id ? <span className={styles.spinner} aria-hidden /> : t('{n}원', { n: number(p.firstPriceMinor ?? p.priceMinor) })}
          </button>
        </li>
      })}
      {!products.length && <li><p>{t('판매 중인 토큰 상품이 없어요.')}</p></li>}
    </ul>
    <p className={styles.note} data-refund-notice>{t('충전한 날부터 7일 안에는 쓰지 않은 토큰을 환불받을 수 있어요. 이미 쓴 토큰은 환불되지 않아요.')} <TransitionLink href="/terms/refund">{t('취소·환불 규정')}</TransitionLink></p>
    <div className={styles.footer}>
      <Button full variant="ghost" size="sm" onClick={onClose} style={{ minHeight: 36, padding: '4px 12px', fontSize: 13 }}>{t('나중에')}</Button>
    </div>
  </div>
}

/** 금액 단계별 그림(11/3 힉스필드 GPT Image 2.5로 한 장에 5단계를 그려 잘랐다 — 같은 배율·바닥 맞춤이라 금액이 클수록 커 보인다). */
function TokenArt({ tier }: { tier: number }) {
  return <img className={styles.art} src={`/recharge/pack-${Math.min(4, Math.max(0, tier)) + 1}.png`} alt="" aria-hidden width={64} height={64} decoding="async" />
}
