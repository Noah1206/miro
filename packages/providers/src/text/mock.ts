import type { AIInput, AIProvider } from './types'
import type { ProviderInfo } from '../types'

/** 키가 없을 때. 실제 AI 인 척하지 않는다 — info.mode 가 'mock' 이고 답은 호출자가 준 함수가 만든다. */
export class MockTextProvider implements AIProvider {
  readonly info: ProviderInfo = { mode: 'mock', name: 'mock-text', notice: 'AI Provider 미구성 — 정해진 대사입니다.' }
  constructor(private readonly build: (input: AIInput) => string) {}
  async generateResponse(input: AIInput): Promise<string> { return this.build(input) }
}
