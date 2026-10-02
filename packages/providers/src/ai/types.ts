import type { ProviderInfo } from '../types'
import type { AITask } from './tasks'
import type { ModelDefinition } from './model-registry'

/**
 * 통합 AI Provider 계약. Miro 의 다른 코드는 이 인터페이스로만 모델을 부른다 —
 * Gemini/Anthropic/OpenAI/Cloudflare SDK 나 REST 형식이 바깥으로 새지 않는다.
 * Provider 는 '글자'만 만든다. 파싱·검증·재시도·fallback·사용량 기록은 Orchestrator 의 일이다.
 */
export type GenerationRequest = {
  /** 무슨 일로 부르는지 (character_response, semantic_analysis, memory_summary, reality_content …). 사용량 기록의 축. */
  task: string
  system: string
  prompt: string
  /** true 면 JSON 객체만 돌려주도록 요청한다 (모델이 지원하면 JSON 모드). */
  json?: boolean
  /** JSON Schema the provider may enforce while decoding (Gemini responseJsonSchema). Others ignore it; the caller still validates. */
  responseSchema?: Record<string, unknown>
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
  promptVersion?: string
  /** Trusted server-side flat media ceiling, never accepted from client input. */
  costCeilingUSD?: number
  /**
   * 생각 수준. 없으면 모델의 최소값(대사 생성용). 한 번 하고 끝나는 분석처럼 품질이 비용보다 중요한 호출만 올린다 —
   * 생각 토큰은 출력 단가로 과금되고 maxTokens 를 같이 쓴다. 생각 수준을 받지 않는 모델은 무시한다.
   */
  thinking?: 'low' | 'medium' | 'high'
  /**
   * 공급자 안전 필터 수준. 없으면 중간 이상 차단. 'relaxed' = 높은 위험만 차단 — 사용자 글을 자료로 읽는 자율성 계획·검사·컴파일과
   * 근거·상태 자료 때문에 막히던 자율성 대사(9/29). 따로 돌던 검열 분류기는 10/2 에 뺐다 — 이 필터가 유일한 거름망이다.
   */
  safety?: 'relaxed'
}

export type GenerationResult = {
  blocked?: boolean
  text: string
  provider: string
  model: string
  /** 모델이 알려주지 않으면 null — 추정하지 않는다. */
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  /** 출력 상한에 걸려 잘렸다. 잘린 JSON 은 스키마 오류로만 보이므로 원인을 따로 남긴다. */
  truncated?: boolean
}

export class AIContentBlockedError extends Error {
  constructor() { super('content_blocked') }
}

export interface AIProvider {
  readonly info: ProviderInfo
  generate(input: GenerationRequest): Promise<GenerationResult>
  healthCheck(): Promise<boolean>
  estimateCost?(input: GenerationRequest): Promise<number | null>
}

/** 호출 한 번의 기록. Usage Manager 가 받아 저장한다. 실패도 기록한다 — 비용은 실패해도 든다. */
export type AIUsageRecord = {
  task: string
  traceId?: string
  requestId?: string
  attemptId?: string
  modelId?: string
  modelVersion?: string
  promptVersion?: string
  usageUnits?: number
  estimatedCost?: number | null
  actualCost?: number | null
  fallbackUsed?: boolean
  shadow?: boolean
  ip?: string | null
  origin?: string | null
  provider: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  ok: boolean
  error: string | null
  userId: string | null
  sessionId: string | null
}

export type AIContext = { dialogueModelId?: string; userId?: string | null; sessionId?: string | null; traceId?: string; requestId?: string; ip?: string | null; continuity?: boolean; usageUnits?: number; allowEvaluation?: boolean; shadow?: boolean; workload?: 'interactive' | 'background'
  /** 호출이 나온 경로(턴 정책의 origin). ai_usage 에 남아 경로별 원가·지연을 비교한다. */
  origin?: string }
export type AIRequest = GenerationRequest & { task: AITask }
export type AIResponse = GenerationResult
export type BudgetDecision = { allowed: true; reservationId: string; maxUsageUnits: number } | { allowed: false; reason: string }
export interface BudgetGuard {
  authorize(request: GenerationRequest, model: ModelDefinition, context: AIContext, attemptId: string): Promise<BudgetDecision>
}
export type AIProviderLease = { heartbeat(): Promise<boolean>; release(): Promise<void> }
export interface AILeaseGuard {
  acquire(provider: string, workload: 'interactive' | 'background'): Promise<AIProviderLease | null>
}
