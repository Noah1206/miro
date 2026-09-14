import { track } from '@/lib/analytics/track'
import type { AnalyticsEvent } from '@miro/domain'

/** 알파 퍼널 이벤트. 게스트 계정의 userId 로 묶는다 (랜딩처럼 계정이 아직 없으면 null). 절대 throw 하지 않는다. */
export function trackAlpha(userId: string | null, event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  void track(userId, event, { alpha: true, ...props })
}
