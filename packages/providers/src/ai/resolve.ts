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
 *   openrouter  OPENROUTER_API_KEY, 모델은 레지스트리에서 (성인 모드 전용 — MIRO_ADULT_MODEL_REGISTRY)
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
    // 저장·학습하지 않는 공급자에게만, 그리고 요청한 JSON 형식을 지키는 공급자에게만 보낸다(처리방침의 '학습에 쓰지 않음'·대사 계약).
    // 빠른 공급자부터(throughput) — 기본(가격순)은 느린 호스트에 걸려 대사가 40~60초 걸렸다(10/3 실측).
    case 'openrouter': return e.OPENROUTER_API_KEY && model
      // 11/16 Gemini 는 OpenRouter 안의 두 길(Google Vertex·Google AI Studio) 가운데 AI Studio 를 먼저 — 같은 요청(언베일 방, 실측 각 12~25회)에
      // Vertex 는 열에 한 번쯤 '참여할 수 없다'는 답을 돌려줬고(실제 방에선 네 번 연속) AI Studio 는 한 번도 없었다. AI Studio 가 막히면(429) Vertex 로 넘어간다.
      ? new OpenAICompatibleProvider('openrouter', e.OPENROUTER_API_KEY, model, 'https://openrouter.ai/api/v1', { provider: { data_collection: 'deny', require_parameters: true,
        // 11/22 Claude 는 Anthropic 호스트 먼저(막히면 다른 호스트로) — throughput 정렬이 Anthropic·Vertex·Bedrock 을 오가 호스트마다 따로인 프롬프트 캐시가 거의 안 맞았다(언베일 Sonnet 5분 안 턴 적중 15%, 직결 39%).
        ...(model.startsWith('google/') ? { order: ['google-ai-studio', 'google-vertex'] } : model.startsWith('anthropic/') ? { order: ['anthropic'] } : { sort: 'throughput' }) } }) : null
    // 11/22 언베일 방 전용 직접 길(OpenRouter 수수료 약 5.5% 절감) — 성인 콘텐츠를 허용하는 공급자만. 키가 없으면 null 이라 OpenRouter 항목이 예비로 남는다.
    case 'deepseek': return e.DEEPSEEK_API_KEY && model ? new OpenAICompatibleProvider('deepseek', e.DEEPSEEK_API_KEY, model, 'https://api.deepseek.com/v1') : null
    case 'xai': return e.XAI_API_KEY && model ? new OpenAICompatibleProvider('xai', e.XAI_API_KEY, model, 'https://api.x.ai/v1') : null
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

/**
 * 강한 일(대사·계획·검사·컴파일)의 예비 모델(10/2 결정). 기본 모델이 공급자 장애로 실패할 때만 쓴다.
 * 운영 레지스트리(MIRO_MODEL_REGISTRY)가 있고 OPENAI_API_KEY 가 있으면 붙는다 — 키가 없으면 예비 없이 예전처럼 돈다.
 * 레지스트리에 같은 id 를 적으면 그쪽이 이긴다(가격·모델을 바꿀 때).
 */
export const BACKUP_MODEL = { id: 'gpt-mini', provider: 'openai', providerModelId: 'gpt-5.4-mini', tier: 'standard', capabilities: ['dialogue'],
  inputCost: 0.75, outputCost: 4.5, maxContextTokens: 400_000, maxOutputTokens: 16_384, enabled: true, version: '2026-10-02', trainingAllowed: false, fallback: true }

export function registryFromEnv(mock: (req: GenerationRequest) => unknown): { registry: ModelRegistry; resolveModel: (m: ModelDefinition) => AIProvider } {
  let registry: ModelRegistry
  if (process.env.MIRO_MODEL_REGISTRY) {
    const definitions = JSON.parse(process.env.MIRO_MODEL_REGISTRY) as Array<{ id?: unknown; provider?: unknown; providerModelId?: unknown; fallback?: unknown; enabled?: unknown }>
    const hasBackup = definitions.some(d => d.fallback === true && d.enabled !== false && providerFromEnv(String(d.provider), String(d.providerModelId)))
    if (!hasBackup && process.env.OPENAI_API_KEY && !definitions.some(d => d.id === BACKUP_MODEL.id)) definitions.push(BACKUP_MODEL)
    // 키가 없는 예비는 뺀다 — 예비 하나 때문에 모든 호출이 'credentials missing' 으로 멈추지 않게.
    // 11/16 캐시 단가가 빠진 Claude 항목(Opus 5·4.6)은 정가의 0.1배로 채운다 — 캐시로 읽고도 제값으로 계산·차감됐다.
    registry = new ModelRegistry([...definitions.filter(d => d.fallback !== true || providerFromEnv(String(d.provider), String(d.providerModelId))).map(withCacheRate), ...sharedChatModels('main')])
  } else {
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
    if (!enabled.some(m => m.provider !== 'miro-slm' && !m.fallback && m.capabilities.includes('dialogue'))) throw new Error('AI_DIALOGUE_MODEL_REQUIRED')
  }
  const resolveModel = (m: ModelDefinition): AIProvider => {
    if (m.provider === 'mock') return new MockAIProvider(mock)
    const p = providerFromEnv(m.provider, m.providerModelId)
    if (!p) throw new Error('model provider credentials missing: ' + m.id)
    return p
  }
  return { registry, resolveModel }
}
/**
 * 두 방의 모델 목록을 같게(11/3 사용자: "언베일이랑 일반이랑 똑같이") — 상대 레지스트리의 대화 모델을 OpenRouter 로 빌려 온다.
 * 언베일 방이 빌리는 Claude·Gemini 도 OpenRouter 로만 간다(성인 대화는 메인 키로 보내지 않는다, 10/2). 일반 방의 DeepSeek 은 원래 OpenRouter.
 * 빌린 모델은 예비+직접 선택 — 기본 모델을 바꾸지 않고, 공급자 장애 때 마지막 순번 예비가 될 뿐이다.
 * ponytail: 가격은 원래 레지스트리 값을 쓴다(OpenRouter Gemini 는 약 10% 비쌈). 어긋나면 상대 레지스트리에 OpenRouter 항목을 직접 적어 덮는다.
 */
function sharedChatModels(into: 'main' | 'adult'): object[] {
  // 11/22 사용자(비용): MIRO_ADULT_BORROW=0 이면 언베일 방은 일반 방 모델(Claude·Gemini·GPT)을 빌리지 않고 언베일 레지스트리 모델만 — 빼면 예전처럼 빌린다.
  if (into === 'adult' && process.env.MIRO_ADULT_BORROW === '0') return []
  const raw = process.env[into === 'adult' ? 'MIRO_MODEL_REGISTRY' : 'MIRO_ADULT_MODEL_REGISTRY']
  if (!raw || !process.env.OPENROUTER_API_KEY) return []
  const vendor: Record<string, string> = { anthropic: 'anthropic', gemini: 'google', openai: 'openai', openrouter: '' }
  return (JSON.parse(raw) as Array<Record<string, unknown>>).flatMap(d => {
    const caps = (d.capabilities as string[] | undefined) ?? (into === 'main' ? [...AI_TASKS] : [])
    if (d.enabled === false || (d.fallback === true && d.chatSelectable !== true) || !caps.includes('dialogue') || d.inputCost === undefined || d.outputCost === undefined) return []
    const prefix = vendor[String(d.provider)]
    if (prefix === undefined) return []
    // claude-sonnet-5-5 → anthropic/claude-sonnet-5.5 (OpenRouter 는 버전을 점으로 쓴다)
    const model = prefix ? `${prefix}/${String(d.providerModelId).replace(/-(\d+)-(\d+)$/, '-$1.$2')}` : String(d.providerModelId)
    return [withCacheRate({ id: `shared-${String(d.id)}`, provider: 'openrouter', providerModelId: model, tier: 'standard', capabilities: ['dialogue'],
      inputCost: d.inputCost, outputCost: d.outputCost, maxContextTokens: d.maxContextTokens ?? 128_000, maxOutputTokens: d.maxOutputTokens ?? 16_384,
      // 11/16 캐시 단가·구간 단가도 같이 옮긴다 — 빠져 있어서 OpenRouter 로 보낸 같은 모델이 캐시로 읽고도 할인 없는 값으로 계산·차감됐다(언베일 Sonnet 턴이 일반 방의 두 배).
      ...(d.cachedInputCost === undefined ? {} : { cachedInputCost: d.cachedInputCost }), ...(d.priceTiers ? { priceTiers: d.priceTiers } : {}), ...(d.priceChanges ? { priceChanges: d.priceChanges } : {}),
      fallback: true, chatSelectable: true })]
  })
}

/**
 * 성인 모드 대화방 전용 모델(10/2). 미로 메인 키(Gemini·예비 GPT)와 섞지 않는다 — 성인 대화가 메인 키로 가면 공급자 정책 위반으로 미로 전체가 멈출 수 있다.
 * MIRO_ADULT_MODEL_REGISTRY 는 MIRO_MODEL_REGISTRY 와 같은 모양(JSON 배열, 가격 필수). capabilities·tier 를 비우면 모든 일·standard.
 * 예: [{"id":"adult","provider":"openrouter","providerModelId":"<모델>","inputCost":0.5,"outputCost":2,"maxContextTokens":128000,"maxOutputTokens":4096}]
 */
/**
 * OpenRouter 가 캐시로 읽은 입력에 매기는 값(일반 입력 대비) — 단가표에 캐시 단가가 없을 때만 쓴다(11/16, OpenRouter 문서의 계열별 배수).
 * 모르는 계열·OpenAI(0.25 또는 0.5 로 모델마다 다름)는 할인 없이 둔다 — 원가를 낮게 잡는 쪽으로 틀리지 않게.
 */
const OPENROUTER_CACHE_READ: Array<[RegExp, number]> = [[/^~?anthropic\//, 0.1], [/^deepseek\//, 0.1], [/^google\//, 0.25], [/^x-ai\//, 0.25]]
function withCacheRate<T extends object>(d: T): T {
  const m = d as { provider?: string; providerModelId?: string; inputCost?: number; cachedInputCost?: number }
  const rate = m.cachedInputCost !== undefined || typeof m.inputCost !== 'number' ? undefined
    : m.provider === 'anthropic' ? 0.1
    : m.provider === 'openrouter' ? OPENROUTER_CACHE_READ.find(([family]) => family.test(m.providerModelId ?? ''))?.[1] : undefined
  return rate === undefined ? d : { ...d, cachedInputCost: m.inputCost! * rate }
}
export function adultRegistry(): ModelRegistry | null {
  if (!process.env.MIRO_ADULT_MODEL_REGISTRY) return null
  const definitions = (JSON.parse(process.env.MIRO_ADULT_MODEL_REGISTRY) as object[]).map(d => withCacheRate({ capabilities: [...AI_TASKS], tier: 'standard', ...d }))
  const registry = new ModelRegistry([...definitions, ...sharedChatModels('adult')])
  const enabled = registry.models.filter(m => m.enabled)
  return enabled.some(m => m.capabilities.includes('dialogue'))
    && enabled.every(m => m.provider !== 'mock' && m.inputCost !== undefined && m.outputCost !== undefined && providerFromEnv(m.provider, m.providerModelId)) ? registry : null
}
/** 성인 모드를 켤 수 있는 전용 모델이 갖춰졌는가. 설정이 깨져 있어도 false. */
export function adultModelReady(): boolean { try { return adultRegistry() !== null } catch { return false } }
function adultModels(mock: (req: GenerationRequest) => unknown): { registry: ModelRegistry; resolveModel: (m: ModelDefinition) => AIProvider } {
  const registry = adultRegistry()
  if (registry) return { registry, resolveModel: m => providerFromEnv(m.provider, m.providerModelId)! }
  // 운영에서 전용 모델이 없으면 멈춘다 — 메인 모델로 보내지 않는다. 로컬·테스트는 정해진 답.
  if (!mockProvidersAllowed()) throw new Error('ADULT_MODEL_REQUIRED')
  return { registry: new ModelRegistry([{ id: 'mock', provider: 'mock', providerModelId: 'mock', tier: 'small', capabilities: [...AI_TASKS], maxContextTokens: 32768, enabled: true, inputCost: 0, outputCost: 0 }]),
    resolveModel: () => new MockAIProvider(mock) }
}

export function createAI(opts: { mock: (req: GenerationRequest) => unknown; context?: AIContext } & Partial<Pick<OrchestratorOptions, 'timeoutMs' | 'maxRetries'>>): AIOrchestrator {
  // 성인 방은 전용 모델로만 — 고른 대화 모델·이어가기 소형 모델·섀도 비교는 메인 쪽이라 쓰지 않는다.
  const adult = opts.context?.adult === true
  const { registry, resolveModel } = adult ? adultModels(opts.mock) : registryFromEnv(opts.mock)
  const context = adult ? { ...opts.context,
    dialogueModelId: registry.models.some(m => m.enabled && m.id === opts.context?.dialogueModelId && m.capabilities.includes('dialogue')) ? opts.context?.dialogueModelId : undefined,
    continuity: false } : opts.context
  const enabled = registry.models.filter(m => m.enabled)
  if (!enabled.length) throw new Error('no enabled AI model')
  const shadowModel = !adult && process.env.MIRO_SHADOW_MODEL && opts.context?.allowEvaluation && process.env.MIRO_MODEL_ROLLBACK !== '1' ? registry.get(process.env.MIRO_SHADOW_MODEL) : undefined
  return new AIOrchestrator({
    shadow: shadowModel ? { model: shadowModel, provider: resolveModel(shadowModel) } : undefined,
    chain: [resolveModel(enabled[0]!)], registry, resolveModel,
    // This is operator-owned main-lane configuration, never an API/chat input. Adult rooms
    // keep their registry; continuity keeps its small-model route, including verification.
    taskModels: !adult && !context?.continuity && process.env.MIRO_AGENCY_VERIFY_MODEL_ID?.trim()
      ? { agency_verify: process.env.MIRO_AGENCY_VERIFY_MODEL_ID.trim() } : undefined,
    timeoutMs: opts.timeoutMs ?? (Number(process.env.AI_TIMEOUT_MS) || 20_000), maxRetries: opts.maxRetries,
    onUsage: usageSink ?? undefined, budgetGuard: guard, leaseGuard, context,
    rollout: { shadowModel: process.env.MIRO_SHADOW_MODEL, canaryModel: process.env.MIRO_CANARY_MODEL, canaryPercent: Number(process.env.MIRO_CANARY_PERCENT ?? 0), approved: process.env.MIRO_CANARY_APPROVED === '1', rollback: process.env.MIRO_MODEL_ROLLBACK === '1' },
  })
}
