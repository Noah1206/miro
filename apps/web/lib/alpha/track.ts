import { track } from '@/lib/analytics/track'
import type { AnalyticsEvent } from '@miro/domain'

/** 알파 퍼널 이벤트. 로그인이 없으니 userId 는 null, 세션 id 로 묶는다. 절대 throw 하지 않는다. */
export function trackAlpha(sessionId: string | null, event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  void track(null, event, { alphaSession: sessionId, ...props })
}
