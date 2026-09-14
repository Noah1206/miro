import { createAI, type LLMProvider } from '@miro/providers'
import { buildMockProposal } from '@miro/engine'
import { installAIUsageSink } from '@/lib/usage/ai-usage'

/**
 * RP 용 AI = Orchestrator (체인·재시도·타임아웃·fallback·사용량 기록).
 * Provider 가 하나도 없으면 RP 전용 Mock — 결정적 제안을 만든다. 실제 AI 인 척하지 않는다.
 */
export function resolveRpLLM(characterName: string, context?: { userId?: string | null; sessionId?: string | null }): LLMProvider {
  installAIUsageSink()
  return createAI({ mock: (req) => buildMockProposal(req.prompt, { characterName, system: req.system }), context })
}
