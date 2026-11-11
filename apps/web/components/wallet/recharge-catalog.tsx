'use client'
import type { RechargeProduct } from '@miro/config'
import { Button, TransitionLink } from '@/components/ui'
import { useLanguage, useT } from '@/lib/i18n/client'
import { INTL_LOCALE } from '@/lib/i18n'
import styles from './recharge-catalog.module.css'

/**
 * 충전 금액 목록(11/3) — 금액이 클수록 그림이 풍성해지고(토큰 → 쌓인 토큰 → 가방 → 가방·선물), 금액 버튼을 누르면 바로 주문으로 넘어간다.
 * '다음으로' 단계는 없다.
 */
export function RechargeCatalog({ available, products, onPick, onClose, busy = false, picking = null }: {
  available: number; products: RechargeProduct[]; onPick: (id: string) => void; onClose: () => void; busy?: boolean; picking?: string | null
}) {
  const t = useT(), locale = INTL_LOCALE[useLanguage()]
  const number = (n: number) => n.toLocaleString(locale)
  const last = Math.max(1, products.length - 1)
  return <div className={styles.catalog}>
    <div className={styles.balance}>
      <span>{t('보유 토큰')}</span>
      <strong><img src="/miro-token.svg" alt="" width={20} height={20} />{number(available)}<small>{t('미로 토큰')}</small></strong>
    </div>
    <ul className={styles.options} aria-label={t('충전할 금액')}>
      {products.map((p, i) => {
        const id = `recharge:${p.id}`
        return <li key={p.id} className={styles.option}>
          <TokenArt tier={products.length === 1 ? 0 : Math.round(i * 4 / last)} />
          <span className={styles.quantity}><strong>{number(p.units)}</strong><small>{t('미로 토큰')}</small>
            {/* 11/12 첫 구매 할인이 걸린 상품에 할인율 태그 */}
            {p.firstPriceMinor && <><i className={styles.break} aria-hidden /><em className={styles.tag}>{t('{n}% 할인', { n: Math.round((1 - p.firstPriceMinor / p.priceMinor) * 100) })}</em><s className={styles.was}>{t('{n}원', { n: number(p.priceMinor) })}</s></>}</span>
          <button type="button" className={styles.price} value={id} disabled={busy} aria-busy={picking === id} onClick={() => onPick(id)}
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
