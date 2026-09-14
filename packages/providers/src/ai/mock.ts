import type { AIProvider, GenerationRequest, GenerationResult } from './types'
import type { ProviderInfo } from '../types'

/**
 * 키가 없을 때. 실제 AI 인 척하지 않는다 — info.mode 가 'mock' 이고 화면에 그 사실이 뜬다.
 * 답은 호출자가 준 함수가 만든다: JSON 요청이면 객체를, 아니면 문자열을.
 */
export class MockAIProvider implements AIProvider {
  readonly info: ProviderInfo = { mode: 'mock', name: 'mock', notice: 'AI Provider 미구성 — Mock 출력입니다. 실제 생성이 아닙니다.' }
  constructor(private readonly build: (req: GenerationRequest) => unknown) {}

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const out = this.build(req)
    return {
      text: typeof out === 'string' ? out : JSON.stringify(out),
      provider: 'mock', model: 'mock', inputTokens: null, outputTokens: null, latencyMs: 0,
    }
  }
}
