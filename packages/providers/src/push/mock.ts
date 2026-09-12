import type { ProviderInfo } from '../types'
import type { PushPayload, PushProvider, PushResult, PushTarget } from './types'

/** VAPID 미구성 시. 발송을 기록만 하고 성공으로 돌려준다 — 테스트에서 검증 가능. */
export class MockPushProvider implements PushProvider {
  readonly info: ProviderInfo = {
    mode: 'mock',
    name: 'mock-push',
    notice: 'Push Provider 미구성 — 알림이 실제로 발송되지 않습니다.',
  }
  readonly sent: Array<{ target: PushTarget; payload: PushPayload }> = []

  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    this.sent.push({ target, payload })
    return { ok: true }
  }
}
