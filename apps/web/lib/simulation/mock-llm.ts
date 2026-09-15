import { usageWeight } from '@miro/config'
import { createAI, type AIContext, type LLMProvider } from '@miro/providers'
import { buildMockProposal } from '@miro/engine'
import { installAIUsageSink } from '@/lib/usage/ai-usage'
import { guarded } from '@/lib/usage/guard'
import type { UsageKind } from '@miro/domain'

export function resolveRpLLM(characterName: string, context?: AIContext) {
  installAIUsageSink()
  return createAI({ mock: req => req.task === 'semantic_event' ? { events: [] } : req.task.startsWith('memory_') ? { memories: [] } : buildMockProposal(req.prompt, { characterName, system: req.system }), context })
}
/** Auxiliary task usage is part of the same monthly pool, never charged twice for retries. */
export function auxiliaryLLM(characterName: string, context: AIContext & { userId: string; requestId: string }): LLMProvider {
  const ai = resolveRpLLM(characterName, context)
  return { info: ai.info, generateStructured: opts => guarded({ userId: context.userId, kind: opts.task as UsageKind, idempotencyKey: `${context.requestId}:${opts.task}` }, () => resolveRpLLM(characterName, { ...context, usageUnits: usageWeight(opts.task!) }).generateStructured(opts)) }
}
