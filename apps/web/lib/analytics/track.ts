import { db, analyticsEvents } from '@miro/db'
import { isAnalyticsEvent, sanitizeProps, type AnalyticsEvent } from '@miro/domain'
import { observe } from '@/lib/observe'

/**
 * 퍼널 이벤트 기록. 절대 throw 하지 않고, 절대 대기하게 만들지 않는다 —
 * 분석 실패가 제품 흐름을 막으면 안 된다. `void track(...)` 로 호출한다.
 */
export async function track(userId: string | null, event: AnalyticsEvent, props: Record<string, unknown> = {}): Promise<void> {
  if (!isAnalyticsEvent(event)) return
  try {
    await db.insert(analyticsEvents).values({ userId, event, props: sanitizeProps(props) })
  } catch (e) {
    observe('analytics.write_failed', { event, error: (e as Error).message })
  }
}
