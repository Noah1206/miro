import type { ProviderInfo } from '../types'

export type CallMediaSpec = {
  callId: string
  characterName: string
  /** 통화 중 캐릭터가 말할 때 참조할 목소리 정체성 (Provider 확정 후 채움). */
  voiceIdentity: Record<string, unknown> | null
  /** 영상통화 전용 — Visual Identity 기반 프롬프트. 얼굴 일관성의 기준. */
  visualPrompt: string | null
}

export type CallMediaSession = {
  token: string
  mode: 'live' | 'mock'
  /** 클라이언트가 붙을 실시간 엔드포인트. mock 이면 null (텍스트 대체). */
  connectUrl: string | null
}

/** 음성/영상 실시간 Provider. 미확정이므로 Domain 은 이 인터페이스만 안다. */
export interface CallMediaProvider {
  readonly kind: 'voice' | 'video'
  readonly info: ProviderInfo
  startSession(spec: CallMediaSpec): Promise<CallMediaSession>
  endSession(token: string): Promise<void>
}
