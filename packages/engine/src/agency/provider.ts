import { AIContentBlockedError, type LLMProvider } from '@miro/providers'
import type { ZodType, ZodTypeAny } from 'zod'
import { UnsafeContentError } from '../safety'

export type AgencyProviderTrace = {
  providerMode: 'live' | 'mock' | 'fallback'
  providerName: string
  modelId: string | null
  promptVersion: string
}

/** Capture immediately after generation; later moderation calls can change orchestrator metadata. */
export function agencyProviderTrace(llm: LLMProvider, promptVersion: string): AgencyProviderTrace {
  const metadata = llm as LLMProvider & { lastFallbackUsed?: boolean; lastModelId?: string | null }
  return {
    providerMode: llm.info.mode === 'mock' ? 'mock' : metadata.lastFallbackUsed === true ? 'fallback' : 'live',
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
    case 'ZodDiscriminatedUnion': return { anyOf: def.options.map((option: ZodTypeAny) => responseJsonSchema(option)) }
    default: throw new Error(`responseJsonSchema: unsupported ${def.typeName}`)
  }
}

/** No fabricated fallback or swallowed budget failure. At most one bounded retry (plan §6), never a loop. */
export async function generateAgencyStructured<T>(llm: LLMProvider, opts: {
  schema: ZodType<T>
  system: string
  prompt: string
  promptVersion: string
  maxTokens: number
}): Promise<T> {
  try {
    const result = await llm.generateStructured({ ...opts, task: 'world_update', maxRetries: 1, responseSchema: responseJsonSchema(opts.schema) })
    // The boundary is validated even for injected providers used by replay/integration adapters.
    return opts.schema.parse(result)
  } catch (error) {
    if (error instanceof AIContentBlockedError) throw new UnsafeContentError()
    throw error
  }
}
