import webpush from 'web-push'
import type { ProviderInfo } from '../types'
import type { PushPayload, PushProvider, PushResult, PushTarget } from './types'

/** Web Push (VAPID). 브라우저 PWA 로 앱이 닫혀 있어도 도달한다. */
export class WebPushProvider implements PushProvider {
  readonly info: ProviderInfo

  constructor(opts: { subject: string; publicKey: string; privateKey: string }) {
    webpush.setVapidDetails(opts.subject, opts.publicKey, opts.privateKey)
    this.info = { mode: 'live', name: 'web-push', notice: null }
  }

  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 12 },
      )
      return { ok: true }
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      return {
        ok: false,
        gone: status === 404 || status === 410,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }
}
