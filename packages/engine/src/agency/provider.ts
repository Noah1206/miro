import { AIContentBlockedError, type LLMProvider } from '@miro/providers'
import type { ZodType, ZodTypeAny, ZodTypeDef } from 'zod'
import { UnsafeContentError } from '../safety'

export type AgencyProviderTrace = {
  providerMode: 'live' | 'mock'
  providerName: string
  modelId: string | null
  promptVersion: string
}

/**
 * Capture immediately after generation; a later call can change orchestrator metadata.
 * 예비 모델(GPT-5.4 mini)이 답해도 live 다 — 강한 일의 정식 예비다(10/2 결정). 어느 모델이 답했는지는 modelId 가 남긴다.
 */
export function agencyProviderTrace(llm: LLMProvider, promptVersion: string): AgencyProviderTrace {
  const metadata = llm as LLMProvider & { lastModelId?: string | null }
  return {
    providerMode: llm.info.mode === 'mock' ? 'mock' : 'live',
    providerName: llm.info.name,
    modelId: metadata.lastModelId ?? null,
    promptVersion,
  }
}

type Check = { kind: string; value?: number; regex?: RegExp }

/**
 * JSON Schema for decoding-time enforcement (Gemini responseJsonSchema), using only the keywords Gemini documents.
 * String lengths, patterns and array lengths become descriptions instead; zod still validates all of it.
 */
export function responseJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const def = schema._def
  const checks: Check[] = def.checks ?? []
  const check = (kind: string) => checks.find(c => c.kind === kind)?.value
  switch (def.typeName) {
    case 'ZodObject': {
      const shape: Record<string, ZodTypeAny> = def.shape()
      return { type: 'object', properties: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, responseJsonSchema(value)])),
        required: Object.keys(shape).filter(key => !shape[key]!.isOptional()),
        ...(def.unknownKeys === 'strict' ? { additionalProperties: false } : {}) }
    }
    case 'ZodArray': {
      // Measured 2026-09-24: gemini-3.8-flash rejects these schemas with nested bounded arrays (HTTP 400), so bounds are hints.
      const min: number | undefined = def.minLength?.value, max: number | undefined = def.maxLength?.value
      const hint = min && max ? `${min} to ${max} items` : max ? `at most ${max} items` : min ? `at least ${min} items` : null
      return { type: 'array', items: responseJsonSchema(def.type), ...(hint ? { description: hint } : {}) }
    }
    case 'ZodString': {
      const hints = checks.flatMap(c => c.kind === 'max' ? [`at most ${c.value} characters`] : c.kind === 'regex' ? [`matches ${c.regex}`] : [])
      return { type: 'string', ...(checks.some(c => c.kind === 'datetime') ? { format: 'date-time' } : {}),
        ...(hints.length ? { description: hints.join('; ') } : {}) }
    }
    case 'ZodNumber': return { type: checks.some(c => c.kind === 'int') ? 'integer' : 'number',
      ...(check('min') === undefined ? {} : { minimum: check('min') }), ...(check('max') === undefined ? {} : { maximum: check('max') }) }
    case 'ZodBoolean': return { type: 'boolean' }
    case 'ZodEnum': return { type: 'string', enum: def.values }
    case 'ZodLiteral': return { type: typeof def.value, enum: [def.value] }
    case 'ZodOptional': return responseJsonSchema(def.innerType)
    // 전처리·검사 래퍼는 받는 모양이 안쪽 스키마와 같다.
    case 'ZodEffects': return responseJsonSchema(def.schema)
    case 'ZodDiscriminatedUnion': return { anyOf: def.options.map((option: ZodTypeAny) => responseJsonSchema(option)) }
    default: throw new Error(`responseJsonSchema: unsupported ${def.typeName}`)
  }
}

/** No fabricated fallback or swallowed budget failure. At most one bounded retry (plan §6), never a loop. */
export async function generateAgencyStructured<T>(llm: LLMProvider, opts: {
  /** 계획·검사·컴파일·자기 삶은 작업 이름이 따로다 — 역할마다 모델을 따로 줄 수 있게(10/2). */
  task: 'agency_plan' | 'agency_verify' | 'agency_compile' | 'agency_life'
  /** 받는 모양(Input)은 전처리로 넓을 수 있다 — 돌려주는 것은 검증된 T 다. */
  schema: ZodType<T, ZodTypeDef, unknown>
  system: string
  prompt: string
  promptVersion: string
  maxTokens: number
  /** 생각 수준(없으면 모델의 최소). 원문을 글자 그대로 옮겨야 하는 일회성 정리처럼 정확도가 지연보다 중요할 때만. */
  thinking?: 'low' | 'medium' | 'high'
}): Promise<T> {
  try {
    // 계획·검사·컴파일은 사용자 글을 자료로 읽고 출력은 보이지 않는다 — 공급자 필터는 높은 위험만 막는다.
    const result = await llm.generateStructured({ ...opts, maxRetries: 1, responseSchema: responseJsonSchema(opts.schema), safety: 'relaxed' })
    // The boundary is validated even for injected providers used by replay/integration adapters.
    return opts.schema.parse(result)
  } catch (error) {
    if (error instanceof AIContentBlockedError) throw new UnsafeContentError()
    throw error
  }
}
