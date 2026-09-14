import type { ProviderInfo } from '../types'

/** 자유 텍스트 한 마디. 구조화 출력(LLMProvider)과 달리 JSON 을 요구하지 않는다 — 무료 모델도 붙는다. */
export type AIInput = {
  system: string
  prompt: string
  maxTokens?: number
}

export interface AIProvider {
  readonly info: ProviderInfo
  generateResponse(input: AIInput): Promise<string>
}
