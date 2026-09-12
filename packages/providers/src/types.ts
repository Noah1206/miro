import type { ZodType, ZodTypeDef } from 'zod'

/** Provider 가 미구성일 때 실제 AI 처럼 가장하지 않기 위한 표식. */
export type ProviderMode = 'live' | 'mock'

export type ProviderInfo = {
  mode: ProviderMode
  name: string
  /** 개발 환경 배너에 표시할 사유. live 이면 null. */
  notice: string | null
}

export interface LLMProvider {
  readonly info: ProviderInfo
  /**
   * 구조화 생성. 자유 문자열이 아니라 검증된 스키마를 반환한다.
   * 한 User Message 에 대해 여러 LLM 을 연속 호출하지 않는다 — 1회 호출로 끝낸다.
   */
  generateStructured<Out, In = Out>(opts: {
    /** 파싱 결과(Out)를 반환한다. .default() 가 있으면 In 과 Out 이 다르다. */
    schema: ZodType<Out, ZodTypeDef, In>
    system: string
    prompt: string
    /** 스키마 위반 시 재시도 횟수. 무한 재시도 금지. */
    maxRetries?: number
  }): Promise<Out>
}

export type ImageSpec = {
  /** Visual Identity 기반 프롬프트. 기능마다 다른 외형을 만들지 않는다. */
  prompt: string
  sceneKey: string | null
  aspect: '1:1' | '3:4' | '16:9'
}

export type GeneratedImage = {
  url: string
  providerMetadata: Record<string, unknown>
}

export interface ImageProvider {
  readonly info: ProviderInfo
  generate(spec: ImageSpec): Promise<GeneratedImage>
}

export class ProviderNotConfiguredError extends Error {
  constructor(kind: string) {
    super(`${kind} provider is not configured`)
    this.name = 'ProviderNotConfiguredError'
  }
}
