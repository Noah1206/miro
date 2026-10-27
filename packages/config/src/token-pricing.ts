import { PLANNED_RECHARGE_TIERS, rechargeCatalog } from './recharge-policy'

/** Purchase tokens are a wallet unit, not provider processing tokens. USD rates are per million. */
export type TokenPriceTier = { aboveInputTokens: number; inputCost: number; outputCost: number; cachedInputCost?: number }
export type TokenPriceChange = { effectiveAt: string; inputCost: number; outputCost: number; cachedInputCost?: number; priceTiers?: TokenPriceTier[] }
export type TokenPriceModel = { inputCost?: number; outputCost?: number; cachedInputCost?: number; priceTiers?: TokenPriceTier[]; priceChanges?: TokenPriceChange[]; maxContextTokens: number; maxOutputTokens: number }
/** Thresholds apply to the whole request, not just the excess input. */
export function tokenRates(model: TokenPriceModel, input: number, now = Date.now()) {
  const scheduled = model.priceChanges?.filter(p => Date.parse(p.effectiveAt) <= now).sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt))[0]
  const current = scheduled ?? model
  const tier = current.priceTiers?.filter(t => input > t.aboveInputTokens).sort((a, b) => b.aboveInputTokens - a.aboveInputTokens)[0]
  const rates = tier ?? current
  if (rates.inputCost === undefined || rates.outputCost === undefined || !Number.isFinite(rates.inputCost) || !Number.isFinite(rates.outputCost)
    || rates.inputCost < 0 || rates.outputCost < 0) throw new Error('unknown token price')
  return { inputCost: rates.inputCost, outputCost: rates.outputCost, cachedInputCost: rates.cachedInputCost ?? rates.inputCost }
}
export type TokenPricing = { fxKRWPerUSD: number; costShare: number; revenueKRWPerToken: number; maxInputTokens: number; turnAllowance: number }
export function tokenPricing(): TokenPricing {
  const raw = JSON.parse(process.env.MIRO_TOKEN_PRICING || '{}')
  const rates = [...PLANNED_RECHARGE_TIERS.map(p => p.priceKRW / p.units),
    ...rechargeCatalog().products.filter(p => p.currency === 'KRW').map(p => p.priceMinor / p.units)]
  const p = { fxKRWPerUSD: raw.fxKRWPerUSD ?? 1500, costShare: 0.5,
    revenueKRWPerToken: Math.min(...rates), maxInputTokens: raw.maxInputTokens ?? 64000, turnAllowance: raw.turnAllowance ?? 2 }
  if (!Number.isFinite(p.fxKRWPerUSD) || p.fxKRWPerUSD <= 0 || !Number.isFinite(p.revenueKRWPerToken) || p.revenueKRWPerToken <= 0
    || !Number.isSafeInteger(p.maxInputTokens) || p.maxInputTokens < 1024 || !Number.isFinite(p.turnAllowance) || p.turnAllowance < 1 || p.turnAllowance > 10)
    throw new Error('invalid token pricing')
  return p
}
export function tokensForCost(usd: number, pricing = tokenPricing()): number {
  if (!Number.isFinite(usd) || usd < 0) throw new Error('invalid token cost')
  const tokens = Math.ceil(usd * pricing.fxKRWPerUSD / (pricing.revenueKRWPerToken * pricing.costShare))
  if (!Number.isSafeInteger(tokens)) throw new Error('invalid token amount')
  return tokens
}
export function tokenQuote(model: TokenPriceModel, output: number, pricing = tokenPricing()) {
  const maxOutputTokens = Math.min(output, model.maxOutputTokens)
  const maxInputTokens = Math.min(pricing.maxInputTokens, model.maxContextTokens - maxOutputTokens)
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0 || maxInputTokens < 1024) throw new Error('invalid token limits')
  const rates = tokenRates(model, maxInputTokens)
  const maximumUSD = (maxInputTokens * rates.inputCost + maxOutputTokens * rates.outputCost) / 1e6 * pricing.turnAllowance
  return { maxInputTokens, maxOutputTokens, maximumUSD, maximumTokens: tokensForCost(maximumUSD, pricing) }
}
