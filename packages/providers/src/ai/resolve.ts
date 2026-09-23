import { mockProvidersAllowed, productionRuntime } from '@miro/config'
import { ModelRegistry, type ModelDefinition } from './model-registry'
import { AI_TASKS } from './tasks'
import { AnthropicProvider } from './anthropic'
import { MiroSLMProvider } from './miro-slm'
import type { AILeaseGuard, BudgetGuard } from './types'
import { CloudflareProvider } from './cloudflare'
import { GeminiProvider } from './gemini'
import { MockAIProvider } from './mock'
import { OpenAICompatibleProvider } from './openai-compatible'
import { AIOrchestrator, type OrchestratorOptions } from './orchestrator'
import type { AIContext, AIProvider, AIUsageRecord, GenerationRequest } from './types'

/**
 * Provider 는 환경변수 이름 하나로 고른다 — 코드는 어느 모델에도 묶이지 않는다.
 *   AI_PROVIDER          primary   (gemini | cloudflare | gateway | openai | mock)
 *   AI_FALLBACK_PROVIDER secondary (같은 값들, 비우면 없음)
 * 각 Provider 의 키·모델:
 *   gemini      GEMINI_API_KEY, GEMINI_MODEL
 *   cloudflare  CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_AI_MODEL
 *   gateway     AI_GATEWAY_API_KEY, MIRO_LLM_MODEL ("anthropic/claude-haiku-4-5" 처럼 provider/model)
 *   openai      OPENAI_API_KEY, OPENAI_MODEL, (OPENAI_BASE_URL — 로컬 서버도 여기로)
 */
export function providerFromEnv(name: string | undefined, model?: string): AIProvider | null {
  const e = process.env
  switch ((name ?? '').toLowerCase()) {
    case 'gemini': return e.GEMINI_API_KEY ? new GeminiProvider(e.GEMINI_API_KEY, model || e.GEMINI_MODEL || undefined) : null
    case 'cloudflare': return e.CLOUDFLARE_ACCOUNT_ID && e.CLOUDFLARE_API_TOKEN
      ? new CloudflareProvider(e.CLOUDFLARE_ACCOUNT_ID, e.CLOUDFLARE_API_TOKEN, model || e.CLOUDFLARE_AI_MODEL || undefined) : null
    case 'gateway': return e.AI_GATEWAY_API_KEY && (model || e.MIRO_LLM_MODEL)
      ? new OpenAICompatibleProvider('gateway', e.AI_GATEWAY_API_KEY, (model || e.MIRO_LLM_MODEL)!, 'https://ai-gateway.vercel.sh/v1') : null
    case 'openai': return e.OPENAI_API_KEY && (model || e.OPENAI_MODEL)
      ? new OpenAICompatibleProvider('openai', e.OPENAI_API_KEY, (model || e.OPENAI_MODEL)!, e.OPENAI_BASE_URL || 'https://api.openai.com/v1') : null
    case 'anthropic': return e.ANTHROPIC_API_KEY && (model || e.ANTHROPIC_MODEL) ? new AnthropicProvider(e.ANTHROPIC_API_KEY, (model || e.ANTHROPIC_MODEL)!) : null
    case 'miro-slm': return e.MIRO_SLM_URL && (model || e.MIRO_SLM_MODEL) ? new MiroSLMProvider(e.MIRO_SLM_URL, e.MIRO_SLM_API_KEY ?? '', (model || e.MIRO_SLM_MODEL)!) : null
    default: return null
  }
}

/** primary → fallback 순서. 둘 다 없으면 Mock 하나 — 서비스가 죽는 대신 정해진 답을 낸다. */
export function resolveAIChain(mock: (req: GenerationRequest) => unknown): AIProvider[] {
  const chain = [providerFromEnv(process.env.AI_PROVIDER), providerFromEnv(process.env.AI_FALLBACK_PROVIDER)]
    .filter((p): p is AIProvider => p !== null)
  if (!chain.length && !mockProvidersAllowed()) throw new Error('AI_CONFIGURATION_REQUIRED')
  return chain.length > 0 ? chain : [new MockAIProvider(mock)]
}

let usageSink: ((r: AIUsageRecord) => void | Promise<void>) | null = null
/** Usage Manager 를 꽂는다 (웹 앱이 부팅 때 한 번). Provider 패키지는 DB 를 모른다. */
export function setAIUsageSink(sink: (r: AIUsageRecord) => void | Promise<void>): void { usageSink = sink }

let guard: BudgetGuard | undefined
export function setAIBudgetGuard(value: BudgetGuard): void { guard = value }
let leaseGuard: AILeaseGuard | undefined
export function setAILeaseGuard(value: AILeaseGuard | undefined): void { leaseGuard = value }

export function registryFromEnv(mock: (req: GenerationRequest) => unknown): { registry: ModelRegistry; resolveModel: (m: ModelDefinition) => AIProvider } {
  let registry: ModelRegistry
  if (process.env.MIRO_MODEL_REGISTRY) registry = new ModelRegistry(JSON.parse(process.env.MIRO_MODEL_REGISTRY))
  else {
    const names = [process.env.AI_PROVIDER, process.env.AI_FALLBACK_PROVIDER].filter((n): n is string => !!n && n !== 'mock')
    const definitions = names.map((name, i) => {
      const p = providerFromEnv(name)
      if (!p) throw new Error('configured AI provider is missing credentials')
      const e = process.env
      const models: Record<string, string | undefined> = { gemini: e.GEMINI_MODEL ?? 'gemini-3.5-flash-lite', cloudflare: e.CLOUDFLARE_AI_MODEL ?? '@cf/meta/llama-3.1-8b-instruct', gateway: e.MIRO_LLM_MODEL, openai: e.OPENAI_MODEL, anthropic: e.ANTHROPIC_MODEL, 'miro-slm': e.MIRO_SLM_MODEL }
      return { id: `default-${i}`, provider: name, providerModelId: models[name], tier: 'standard', capabilities: [...AI_TASKS], maxContextTokens: 32768, enabled: true }
    })
    registry = new ModelRegistry(definitions.length ? definitions : [{ id: 'mock', provider: 'mock', providerModelId: 'mock', tier: 'small', capabilities: [...AI_TASKS], maxContextTokens: 32768, enabled: true, inputCost: 0, outputCost: 0 }])
  }
  if (productionRuntime()) {
    const enabled = registry.models.filter(m => m.enabled)
    if (!enabled.length || enabled.some(m => m.provider === 'mock')) throw new Error('AI_CONFIGURATION_REQUIRED')
    if (enabled.some(m => m.inputCost === undefined || m.outputCost === undefined)) throw new Error('AI_MODEL_PRICES_REQUIRED')
    if (!enabled.some(m => m.provider !== 'miro-slm' && m.capabilities.includes('dialogue'))) throw new Error('AI_DIALOGUE_MODEL_REQUIRED')
  }
  const resolveModel = (m: ModelDefinition): AIProvider => {
    if (m.provider === 'mock') return new MockAIProvider(mock)
    const p = providerFromEnv(m.provider, m.providerModelId)
    if (!p) throw new Error('model provider credentials missing: ' + m.id)
    return p
  }
  return { registry, resolveModel }
}
export function createAI(opts: { mock: (req: GenerationRequest) => unknown; context?: AIContext } & Partial<Pick<OrchestratorOptions, 'timeoutMs' | 'maxRetries'>>): AIOrchestrator {
  const { registry, resolveModel } = registryFromEnv(opts.mock)
  const enabled = registry.models.filter(m => m.enabled)
  if (!enabled.length) throw new Error('no enabled AI model')
  const shadowModel = process.env.MIRO_SHADOW_MODEL && opts.context?.allowEvaluation && process.env.MIRO_MODEL_ROLLBACK !== '1' ? registry.get(process.env.MIRO_SHADOW_MODEL) : undefined
  return new AIOrchestrator({
    shadow: shadowModel ? { model: shadowModel, provider: resolveModel(shadowModel) } : undefined,
    chain: [resolveModel(enabled[0]!)], registry, resolveModel,
    timeoutMs: opts.timeoutMs ?? (Number(process.env.AI_TIMEOUT_MS) || 20_000), maxRetries: opts.maxRetries,
    onUsage: usageSink ?? undefined, budgetGuard: guard, leaseGuard, context: opts.context,
    rollout: { shadowModel: process.env.MIRO_SHADOW_MODEL, canaryModel: process.env.MIRO_CANARY_MODEL, canaryPercent: Number(process.env.MIRO_CANARY_PERCENT ?? 0), approved: process.env.MIRO_CANARY_APPROVED === '1', rollback: process.env.MIRO_MODEL_ROLLBACK === '1' },
  })
}
