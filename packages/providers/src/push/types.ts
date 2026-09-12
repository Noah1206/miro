import type { ProviderInfo } from '../types'

export type PushTarget = { endpoint: string; p256dh: string; auth: string }

export type PushPayload = {
  title: string
  body: string
  /** 탭 시 열 경로 */
  url: string
  /** 같은 세션의 알림은 하나로 합친다. */
  tag: string
}

export type PushResult =
  | { ok: true }
  /** gone=true 면 구독이 만료됨(410/404). 호출자가 정리한다. */
  | { ok: false; gone: boolean; error: string }

export interface PushProvider {
  readonly info: ProviderInfo
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>
}
