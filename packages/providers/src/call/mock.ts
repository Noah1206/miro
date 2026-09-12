import type { ProviderInfo } from '../types'
import type { CallMediaProvider, CallMediaSession, CallMediaSpec } from './types'

/** Provider 미구성 시 텍스트 통화로 대체한다. 실시간 음성/영상인 척하지 않는다. */
export class MockCallMediaProvider implements CallMediaProvider {
  readonly info: ProviderInfo
  constructor(readonly kind: 'voice' | 'video') {
    this.info = {
      mode: 'mock',
      name: `mock-${kind}`,
      notice: kind === 'voice'
        ? 'Voice Provider 미구성 — 통화가 텍스트로 진행됩니다.'
        : 'Video Provider 미구성 — 실시간 영상 대신 정지 이미지와 텍스트로 진행됩니다.',
    }
  }
  async startSession(spec: CallMediaSpec): Promise<CallMediaSession> {
    return { token: `mock:${this.kind}:${spec.callId}`, mode: 'mock', connectUrl: null }
  }
  async endSession(): Promise<void> {}
}
