import { registryFromEnv, providerFromEnv } from './resolve'

/** Configuration readiness only; never claims the upstream service is reachable. */
export function aiReadiness(): { ready: boolean; reason: string | null } {
  try {
    const { registry } = registryFromEnv(() => null)
    const enabled = registry.models.filter(m => m.enabled)
    if (enabled.some(m => m.provider === 'mock')) return { ready: false, reason: 'AI_CONFIGURATION_REQUIRED' }
    if (enabled.some(m => !providerFromEnv(m.provider, m.providerModelId))) return { ready: false, reason: 'AI_CREDENTIALS_REQUIRED' }
    if (enabled.some(m => m.inputCost === undefined || m.outputCost === undefined)) return { ready: false, reason: 'AI_MODEL_PRICES_REQUIRED' }
    const custom = JSON.parse(process.env.MIRO_BUDGET_POLICY || '{}')
    const budget = Number(custom.global?.cost ?? process.env.AI_DAILY_BUDGET ?? 0)
    if (!Number.isFinite(budget) || budget <= 0) return { ready: false, reason: 'AI_OPERATING_BUDGET_REQUIRED' }
    return { ready: true, reason: null }
  } catch { return { ready: false, reason: 'AI_CONFIGURATION_INVALID' } }
}
