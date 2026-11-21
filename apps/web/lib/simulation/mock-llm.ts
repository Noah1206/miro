import { createAI, type AIContext, type LLMProvider } from '@miro/providers'
import { buildMockProposal } from '@miro/engine'
import { installAIUsageSink } from '@/lib/usage/ai-usage'
import { createAIWithAdultFallback, withAdultDialogueFallback } from '@/lib/ai/adult-fallback'

/** adultFallback: 안전 필터에 막히면 그 호출만 성인 허용 모델로 한 번 더(뒤에서 도는 캐릭터 작업용, adult-fallback.ts). */
export function resolveRpLLM(characterName: string, context?: AIContext, adultFallback = false) {
  installAIUsageSink()
  const opts = { mock: (req: { task: string; prompt: string; system: string }) => req.task === 'semantic_event' ? { events: [] } : req.task.startsWith('memory_') ? { memories: [] } : buildMockProposal(req.prompt, { characterName, system: req.system }), context }
  const ai = (adultFallback ? createAIWithAdultFallback : createAI)(opts)
  // 11/22 언베일 방: 고른 모델이 장면을 거절하면 다른 언베일 모델로 그 턴만 조용히 다시 받는다(adult-fallback.ts). 언베일 방이 아니면 그대로.
  return withAdultDialogueFallback(ai, opts)
}
/** Analysis is included in a successful chat turn; provider dollars are still budgeted per attempt. */
export function auxiliaryLLM(characterName: string, context: AIContext & { userId: string; requestId: string }): LLMProvider {
  return resolveRpLLM(characterName, { ...context, usageUnits: 0 })
}
