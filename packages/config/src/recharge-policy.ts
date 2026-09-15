/**
 * 확정된 가격과 제공량 안내 — 2026-09-16 사용자 결정.
 *
 * 기준 단가 10원/unit 에서 상위 구간일수록 보너스를 키운다. 안내용이며
 * 실제 판매는 여전히 MIRO_RECHARGE_PRODUCTS 가 채워져야 열린다.
 */
export const PLANNED_RECHARGE_TIERS = [
  { priceKRW: 3000, units: 300 },
  { priceKRW: 7000, units: 800 },
  { priceKRW: 14000, units: 1800 },
  { priceKRW: 30000, units: 4200 },
  { priceKRW: 50000, units: 7500 },
] as const

/**
 * 충전 상품 카탈로그. 가격·제공량·유효기간은 Product Decision 이라 코드에 박지 않는다.
 *
 * 기본값은 빈 목록 — 아무것도 팔지 않는 상태다. 운영에서 MIRO_RECHARGE_PRODUCTS 로
 * 상품을 넣어야 비로소 판매가 열린다. 잘못된 설정은 fail closed 로 막는다
 * (usagePolicy 와 같은 방침): 값이 의심스러우면 파는 대신 멈춘다.
 */
export type RechargeProduct = {
  /** 서버가 아는 상품 식별자. 브라우저는 이 id 만 보내고 가격은 보내지 않는다. */
  id: string
  /** 사용자에게 보이는 이름. */
  name: string
  /** 지급할 사용량. usage weights 와 같은 단위다. */
  units: number
  /** 최소 화폐 단위 (KRW 는 원). 정수만 — 부동소수 금액을 만들지 않는다. */
  priceMinor: number
  currency: string
  /** 지급 후 유효기간(일). 생략하면 만료 없음 — 정책 확정 전 기본값이다. */
  validDays?: number
}

export type RechargeCatalog = { products: RechargeProduct[] }

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/
const CURRENCY = /^[A-Z]{3}$/

export function rechargeCatalog(): RechargeCatalog {
  const raw = process.env.MIRO_RECHARGE_PRODUCTS
  if (!raw) return { products: [] }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('invalid recharge catalog') }
  const list = Array.isArray(parsed) ? parsed : (parsed as { products?: unknown })?.products
  if (!Array.isArray(list)) throw new Error('invalid recharge catalog')

  const products: RechargeProduct[] = []
  const seen = new Set<string>()
  for (const item of list) {
    const p = item as Partial<RechargeProduct>
    if (typeof p.id !== 'string' || !ID.test(p.id) || seen.has(p.id)) throw new Error('invalid recharge catalog')
    if (typeof p.name !== 'string' || p.name.trim() === '' || p.name.length > 60) throw new Error('invalid recharge catalog')
    if (!Number.isSafeInteger(p.units) || (p.units as number) <= 0) throw new Error('invalid recharge catalog')
    // 0 원 상품은 결제 없이 잔액을 지급하게 되므로 받지 않는다.
    if (!Number.isSafeInteger(p.priceMinor) || (p.priceMinor as number) <= 0) throw new Error('invalid recharge catalog')
    if (typeof p.currency !== 'string' || !CURRENCY.test(p.currency)) throw new Error('invalid recharge catalog')
    if (p.validDays !== undefined && (!Number.isSafeInteger(p.validDays) || p.validDays <= 0)) throw new Error('invalid recharge catalog')
    seen.add(p.id)
    products.push({ id: p.id, name: p.name, units: p.units as number, priceMinor: p.priceMinor as number, currency: p.currency, ...(p.validDays === undefined ? {} : { validDays: p.validDays }) })
  }
  return { products }
}

/** 판매 중인 상품만 서버가 인정한다. 브라우저가 보낸 id 는 반드시 여기를 통과해야 한다. */
export function rechargeProduct(id: string): RechargeProduct | null {
  return rechargeCatalog().products.find(p => p.id === id) ?? null
}
