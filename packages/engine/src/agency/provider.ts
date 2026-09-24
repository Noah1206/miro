import { AIContentBlockedError, type LLMProvider } from '@miro/providers'
import type { ZodType } from 'zod'
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

/** No fabricated fallback, swallowed budget failure, or autonomous retry loop. */
export async function generateAgencyStructured<T>(llm: LLMProvider, opts: {
  schema: ZodType<T>
  system: string
  prompt: string
  promptVersion: string
  maxTokens: number
}): Promise<T> {
  try {
    const result = await llm.generateStructured({ ...opts, task: 'world_update', maxRetries: 0 })
    // The boundary is validated even for injected providers used by replay/integration adapters.
    return opts.schema.parse(result)
  } catch (error) {
    if (error instanceof AIContentBlockedError) throw new UnsafeContentError()
    throw error
  }
}
