import type { ProviderInfo } from '../types'
import type { AITask, InteractionImportance } from './tasks'
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
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
  promptVersion?: string
  /** Trusted server-side flat media ceiling, never accepted from client input. */
  costCeilingUSD?: number
  importance?: InteractionImportance
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

export type AIContext = { dialogueModelId?: string; userId?: string | null; sessionId?: string | null; traceId?: string; requestId?: string; ip?: string | null; continuity?: boolean; usageUnits?: number; allowEvaluation?: boolean; shadow?: boolean }
export type AIRequest = GenerationRequest & { task: AITask }
export type AIResponse = GenerationResult
export type BudgetDecision = { allowed: true; reservationId: string; maxUsageUnits: number } | { allowed: false; reason: string }
export interface BudgetGuard {
  authorize(request: GenerationRequest, model: ModelDefinition, context: AIContext, attemptId: string): Promise<BudgetDecision>
}
