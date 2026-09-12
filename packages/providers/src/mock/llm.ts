import type { ZodType } from 'zod'
import type { LLMProvider, ProviderInfo } from '../types'

/**
 * Provider 미확정 상태에서 파이프라인 전체를 돌리기 위한 Mock.
 *
 * 실제 AI 처럼 가장하지 않는다 — info.mode 가 'mock' 이고, 개발 환경 배너로 노출된다.
 * 스키마를 만족하는 출력을 만들되, 내용은 입력에서 결정적으로 파생시킨다.
 * 같은 입력에 같은 출력이 나오므로 테스트가 안정적이다.
 */
export class MockLLMProvider implements LLMProvider {
  readonly info: ProviderInfo = {
    mode: 'mock',
    name: 'mock-llm',
    notice: 'LLM Provider 미구성 — Mock 출력입니다. 실제 생성이 아닙니다.',
  }

  constructor(private readonly build: (prompt: string) => unknown) {}

  async generateStructured<T>(opts: {
    schema: ZodType<T>
    system: string
    prompt: string
    maxRetries?: number
  }): Promise<T> {
    const draft = this.build(opts.prompt)
    const parsed = opts.schema.safeParse(draft)
    if (!parsed.success) {
      throw new Error(`mock output failed schema: ${parsed.error.issues[0]?.message}`)
    }
    return parsed.data
  }
}
