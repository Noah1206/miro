import { afterEach, describe, expect, it, vi } from 'vitest'
import { rechargeCatalog, rechargeProduct } from '../recharge-policy'

const ok = { id: 'pack_s', name: '작은 충전', units: 50, priceMinor: 1900, currency: 'KRW' }
const set = (v: unknown) => vi.stubEnv('MIRO_RECHARGE_PRODUCTS', typeof v === 'string' ? v : JSON.stringify(v))
afterEach(() => vi.unstubAllEnvs())

describe('recharge catalog', () => {
  it('sells nothing until products are configured', () => {
    set('')
    expect(rechargeCatalog().products).toEqual([])
    expect(rechargeProduct('pack_s')).toBeNull()
  })

  it('reads a configured product and matches it by id', () => {
    set([ok])
    expect(rechargeCatalog().products).toHaveLength(1)
    expect(rechargeProduct('pack_s')?.units).toBe(50)
    expect(rechargeProduct('pack_forged')).toBeNull()
  })

  it('fails closed rather than selling something malformed', () => {
    for (const bad of [
      'not json',
      [{ ...ok, units: 0 }],                       // 지급량 없는 상품
      [{ ...ok, units: 1.5 }],
      [{ ...ok, priceMinor: 0 }],                  // 0 원이면 결제 없이 잔액이 늘어난다
      [{ ...ok, priceMinor: -100 }],
      [{ ...ok, currency: 'won' }],
      [{ ...ok, id: 'Pack S' }],
      [{ ...ok, name: '' }],
      [{ ...ok, validDays: 0 }],
      [ok, ok],                                    // 같은 id 두 번
      [{ units: 50, priceMinor: 1900, currency: 'KRW' }],
    ]) {
      set(bad)
      expect(() => rechargeCatalog()).toThrow('invalid recharge catalog')
    }
  })

  it('treats a missing expiry as no expiry rather than inventing one', () => {
    set([ok])
    expect(rechargeProduct('pack_s')?.validDays).toBeUndefined()
    set([{ ...ok, validDays: 30 }])
    expect(rechargeProduct('pack_s')?.validDays).toBe(30)
  })
})
