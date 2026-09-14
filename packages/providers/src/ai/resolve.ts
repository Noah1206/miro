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
export function providerFromEnv(name: string | undefined): AIProvider | null {
  const e = process.env
  switch ((name ?? '').toLowerCase()) {
    case 'gemini': return e.GEMINI_API_KEY ? new GeminiProvider(e.GEMINI_API_KEY, e.GEMINI_MODEL || undefined) : null
    case 'cloudflare': return e.CLOUDFLARE_ACCOUNT_ID && e.CLOUDFLARE_API_TOKEN
      ? new CloudflareProvider(e.CLOUDFLARE_ACCOUNT_ID, e.CLOUDFLARE_API_TOKEN, e.CLOUDFLARE_AI_MODEL || undefined) : null
    case 'gateway': return e.AI_GATEWAY_API_KEY && e.MIRO_LLM_MODEL
      ? new OpenAICompatibleProvider('gateway', e.AI_GATEWAY_API_KEY, e.MIRO_LLM_MODEL, 'https://ai-gateway.vercel.sh/v1') : null
    case 'openai': return e.OPENAI_API_KEY && e.OPENAI_MODEL
      ? new OpenAICompatibleProvider('openai', e.OPENAI_API_KEY, e.OPENAI_MODEL, e.OPENAI_BASE_URL || 'https://api.openai.com/v1') : null
    default: return null
  }
}

/** primary → fallback 순서. 둘 다 없으면 Mock 하나 — 서비스가 죽는 대신 정해진 답을 낸다. */
export function resolveAIChain(mock: (req: GenerationRequest) => unknown): AIProvider[] {
  const chain = [providerFromEnv(process.env.AI_PROVIDER), providerFromEnv(process.env.AI_FALLBACK_PROVIDER)]
    .filter((p): p is AIProvider => p !== null)
  return chain.length > 0 ? chain : [new MockAIProvider(mock)]
}

let usageSink: ((r: AIUsageRecord) => void | Promise<void>) | null = null
/** Usage Manager 를 꽂는다 (웹 앱이 부팅 때 한 번). Provider 패키지는 DB 를 모른다. */
export function setAIUsageSink(sink: (r: AIUsageRecord) => void | Promise<void>): void { usageSink = sink }

/** Orchestrator 하나. 요청마다 만들어도 싸다 — 상태는 env 와 sink 뿐이다. */
export function createAI(opts: { mock: (req: GenerationRequest) => unknown; context?: AIContext } & Partial<Pick<OrchestratorOptions, 'timeoutMs' | 'maxRetries'>>): AIOrchestrator {
  return new AIOrchestrator({
    chain: resolveAIChain(opts.mock),
    timeoutMs: opts.timeoutMs ?? (Number(process.env.AI_TIMEOUT_MS) || 20_000),
    maxRetries: opts.maxRetries,
    onUsage: usageSink ?? undefined,
    context: opts.context,
  })
}
