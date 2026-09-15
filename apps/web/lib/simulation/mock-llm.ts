import { createAI, type AIContext, type LLMProvider } from '@miro/providers'
import { buildMockProposal } from '@miro/engine'
import { installAIUsageSink } from '@/lib/usage/ai-usage'

export function resolveRpLLM(characterName: string, context?: AIContext) {
  installAIUsageSink()
  return createAI({ mock: req => req.task === 'semantic_event' ? { events: [] } : req.task.startsWith('memory_') ? { memories: [] } : buildMockProposal(req.prompt, { characterName, system: req.system }), context })
}
/** Analysis is included in a successful chat turn; provider dollars are still budgeted per attempt. */
export function auxiliaryLLM(characterName: string, context: AIContext & { userId: string; requestId: string }): LLMProvider {
  return resolveRpLLM(characterName, { ...context, usageUnits: 0 })
}
