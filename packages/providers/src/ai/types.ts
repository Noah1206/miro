import type { ProviderInfo } from '../types'
import type { AITask } from './tasks'
import type { ModelDefinition } from './model-registry'
import type { TurnMeter } from './turn-meter'

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
  /** Server billing ceiling includes reasoning tokens; adapters must not expand it. */
  hardTokenCap?: boolean
  /** Trusted orchestrator role pin: disable provider-side model substitution as well as local fallback. */
  disableProviderFallback?: boolean
  temperature?: number
  signal?: AbortSignal
  promptVersion?: string
  /** Trusted server-side flat media ceiling, never accepted from client input. */
  costCeilingUSD?: number
  /**
   * 생각 수준. 없으면 모델의 최소값(대사 생성용). 한 번 하고 끝나는 분석처럼 품질이 비용보다 중요한 호출만 올린다 —
   * 생각 토큰은 출력 단가로 과금되고 maxTokens 를 같이 쓴다. 생각 수준을 받지 않는 모델은 무시한다.
   */
  thinking?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /**
   * 공급자 안전 필터 수준. 없으면 중간 이상 차단. 'relaxed' = 높은 위험만 차단 — 사용자 글을 자료로 읽는 자율성 계획·검사·컴파일과
   * 근거·상태 자료 때문에 막히던 자율성 대사(9/29). 따로 돌던 검열 분류기는 10/2 에 뺐다 — 이 필터가 유일한 거름망이다.
   */
  safety?: 'relaxed'
  /**
   * 받는 대로 넘겨 받는 글(이번 시도에서 지금까지 온 전체). 스트리밍을 지원하는 공급자만 부른다(10/9 대사 스트리밍) — 나머지는 무시하고 끝에 한 번에 준다.
   * 이 글은 아직 검증 전이다. 보여 줄지·무엇을 보여 줄지는 부른 쪽이 정한다.
   */
  onText?: (text: string) => void
  /**
   * 11/10 지시문 앞부분 캐시 — system 의 처음 이 글자 수까지는 같은 방의 턴마다 그대로다(캐릭터·규칙). 캐시를 따로 켜야 하는 공급자(Claude)만 쓴다.
   * 나머지(이번 턴 지시)는 그 뒤에 붙는다. 없거나 범위 밖이면 캐시하지 않는다.
   */
  cacheSystemPrefix?: number
  /**
   * 11/16 prompt 앞에 그대로 이어 붙는 글 덩이들(최근 대화, 메시지 하나씩). 턴이 지나도 앞쪽 덩이가 같다 —
   * Claude 는 마지막 덩이에 캐시 표시를 달고, 나머지 공급자는 flatPrompt 로 한 글로 보낸다(앞부분이 같으면 자동 캐시).
   */
  promptPrefix?: string[]
  /**
   * 11/16 같은 대화를 같은 공급자로 보내기 위한 열쇠(방 id 의 해시 — 방 id 자체는 밖으로 보내지 않는다).
   * OpenRouter 는 이 값이 같으면 첫 요청부터 같은 호스트로 보내 캐시가 이어진다. 다른 공급자는 무시한다.
   */
  sessionKey?: string
}
/** promptPrefix 를 prompt 앞에 붙인 한 덩이 글. */
export function flatPrompt(req: Pick<GenerationRequest, 'prompt' | 'promptPrefix'>): string {
  return (req.promptPrefix?.join('') ?? '') + req.prompt
}

export type GenerationResult = {
  blocked?: boolean
  /** 11/22 진단용 — 왜 막혔나: refusal(모델 자발 거절)·content_filter(공급자 필터)·empty(빈 응답)·provider 고유 사유. ai_usage.error 에 붙는다. */
  blockReason?: string
  text: string
  provider: string
  model: string
  /** 모델이 알려주지 않으면 null — 추정하지 않는다. */
  inputTokens: number | null
  /** Subset of input tokens served from provider cache; absent means no measured discount. */
  cachedInputTokens?: number
  /** 11/22 이번 호출이 새로 캐시에 쓴 입력 토큰(Anthropic cache_creation, OpenRouter cache_write_tokens) — 정가보다 25% 비싸다. */
  cacheWriteInputTokens?: number
  outputTokens: number | null
  latencyMs: number
  /** 출력 상한에 걸려 잘렸다. 잘린 JSON 은 스키마 오류로만 보이므로 원인을 따로 남긴다. */
  truncated?: boolean
}

export class AIContentBlockedError extends Error {
  readonly reason?: string
  constructor(reason?: string) { super(reason ? `content_blocked:${reason}` : 'content_blocked'); this.reason = reason }
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

export type AIContext = { turnMeter?: TurnMeter; dialogueModelId?: string; userId?: string | null; sessionId?: string | null; traceId?: string; requestId?: string; ip?: string | null; continuity?: boolean; usageUnits?: number; allowEvaluation?: boolean; shadow?: boolean; workload?: 'interactive' | 'background'
  /** 호출이 나온 경로(턴 정책의 origin). ai_usage 에 남아 경로별 원가·지연을 비교한다. */
  origin?: string
  /** 성인 모드를 켠 적 있는 대화방(10/2) — 성인 전용 모델로만 간다(createAI). 메인 모델로 넘기지 않는다. */
  adult?: boolean }
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
