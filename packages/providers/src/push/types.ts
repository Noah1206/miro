import type { ProviderInfo } from '../types'

export type PushTarget = { endpoint: string; p256dh: string; auth: string }

export type PushPayload = {
  title: string
  body: string
  /** 탭 시 열 경로 */
  url: string
  /** 같은 세션의 알림은 하나로 합친다. */
  tag: string
  /** 11/10 알림 아이콘 = 캐릭터 프로필 사진. 서비스 워커가 그 방 테마(카톡이면 둥근 사각형)에 맞춰 다듬는다. */
  icon?: string
  session?: string
}

export type PushResult =
  | { ok: true }
  /** gone=true 면 구독이 만료됨(410/404). 호출자가 정리한다. */
  | { ok: false; gone: boolean; error: string }

export interface PushProvider {
  readonly info: ProviderInfo
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>
}
