import { GatewayLLMProvider } from './llm/gateway'
import { MockLLMProvider } from './mock/llm'
import { MockImageProvider } from './mock/image'
import { buildMockDraft } from './character/generate'
import type { ImageProvider, LLMProvider } from './types'

/**
 * Provider 선택.
 * 설정이 없으면 Mock 으로 떨어지되, info.mode 로 그 사실을 숨기지 않는다.
 */
export function resolveLLM(): LLMProvider {
  const key = process.env.AI_GATEWAY_API_KEY
  const model = process.env.MIRO_LLM_MODEL
  if (key && model) return new GatewayLLMProvider(key, model)
  return new MockLLMProvider((prompt) => buildMockDraft(prompt))
}

export function resolveImage(): ImageProvider {
  // Image Provider 확정 시 여기에 live adapter 를 추가한다.
  return new MockImageProvider()
}
