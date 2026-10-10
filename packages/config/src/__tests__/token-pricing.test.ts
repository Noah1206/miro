import { afterEach, describe, expect, it, vi } from 'vitest'
import { tokenPricing, tokenQuote, tokensForCost } from '../token-pricing'
afterEach(() => vi.unstubAllEnvs())
describe('purchase token pricing', () => {
  it('uses the cheapest bonus pack and limits provider cost to half its revenue', () => {
    vi.stubEnv('MIRO_RECHARGE_PRODUCTS', '')
    const p = tokenPricing()
    expect(p.revenueKRWPerToken).toBe(50000 / 7500)
    expect(p.costShare).toBe(.5)
    expect(tokensForCost(.04448, p)).toBe(21)
    expect(21 * p.revenueKRWPerToken * .5).toBeGreaterThanOrEqual(.04448 * p.fxKRWPerUSD)
  })
  it('accounts for an even cheaper configured product', () => {
    vi.stubEnv('MIRO_RECHARGE_PRODUCTS', JSON.stringify([{ id: 'sale', name: 'sale', units: 1000, priceMinor: 1000, currency: 'KRW' }]))
    expect(tokenPricing().revenueKRWPerToken).toBe(1)
    expect(tokensForCost(.01)).toBe(30)
  })
  it('clamps output to the registered model limit and reserves analysis/retry allowance', () => {
    const q = tokenQuote({ inputCost: 2, outputCost: 10, maxContextTokens: 200000, maxOutputTokens: 2048 }, 4096)
    expect(q.maxOutputTokens).toBe(2048)
    expect(q.maximumUSD).toBeCloseTo((64000 * 2 + 2048 * 10) / 1e6 * 2)
    expect(q.maximumTokens).toBeGreaterThan(0)
  })
  it('rejects unknown prices and invalid policy, never silently treating them as free', () => {
    expect(() => tokenQuote({ maxContextTokens: 10000, maxOutputTokens: 2048 }, 2048)).toThrow('unknown')
    expect(() => tokensForCost(NaN)).toThrow()
    vi.stubEnv('MIRO_TOKEN_PRICING', '{"fxKRWPerUSD":0}')
    expect(() => tokenPricing()).toThrow()
  })
})
