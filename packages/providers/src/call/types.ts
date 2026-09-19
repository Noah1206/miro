import type { ProviderInfo } from '../types'

export type CallMediaSpec = {
  callId: string
  characterName: string
  /** 통화 중 캐릭터가 말할 때 참조할 목소리 정체성 (Provider 확정 후 채움). */
  voiceIdentity: Record<string, unknown> | null
  /** 영상통화 전용 — Visual Identity 기반 프롬프트. 얼굴 일관성의 기준. */
  visualPrompt: string | null
  /** 실시간 세션에 잠글 캐릭터 시스템 프롬프트 (Gemini Live). 토큰에 고정되어 클라이언트가 바꿀 수 없다. */
  systemInstruction?: string | null
  /** 프리셋 보이스 이름 (Gemini Live). 없으면 provider 기본값. */
  voiceName?: string | null
}

export type CallMediaSession = {
  token: string
  mode: 'live' | 'mock'
  /** 클라이언트가 붙을 실시간 엔드포인트. mock 이면 null (텍스트 대체). */
  connectUrl: string | null
  /** 클라이언트 setup 메시지에 넣을 모델 ID (Gemini Live 전용). */
  model?: string | null
}

/** 음성/영상 실시간 Provider. 미확정이므로 Domain 은 이 인터페이스만 안다. */
export interface CallMediaProvider {
  readonly kind: 'voice' | 'video'
  readonly info: ProviderInfo
  startSession(spec: CallMediaSpec): Promise<CallMediaSession>
  endSession(session: { callId: string }): Promise<void>
}
