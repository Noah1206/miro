/** 지시서 §41 의 퍼널 이벤트. 여기 없는 이름은 track 이 거부한다. */
export const ANALYTICS_EVENTS = [
  'signup', 'character_selected', 'character_created', 'rp_started', 'rp_message_sent',
  'event_triggered', 'scene_changed', 'reality_contact_sent', 'reality_contact_opened',
  'call_started', 'call_completed', 'usage_limit_reached', 'upgrade_viewed', 'subscription_started',
  'archive_opened', 'session_archived', 'session_deleted', 'report_submitted', 'account_deleted',
] as const
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number]

export type AnalyticsProps = Record<string, string | number | boolean | null>

/** 관계 내부 수치·대화 본문은 분석 이벤트에 실리지 않는다 (지시서 §41 Privacy). */
const FORBIDDEN = new Set([
  'trust', 'attraction', 'jealousy', 'protectiveness', 'emotionalDistance', 'attachment', 'stage',
  'content', 'text', 'input', 'message', 'prompt', 'email', 'password',
])

export function sanitizeProps(props: Record<string, unknown>): AnalyticsProps {
  const out: AnalyticsProps = {}
  for (const [k, v] of Object.entries(props)) {
    if (FORBIDDEN.has(k)) continue
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      // 긴 문자열은 본문일 가능성이 높다 — 식별자/종류만 허용한다.
      if (typeof v === 'string' && v.length > 80) continue
      out[k] = v
    }
  }
  return out
}

export function isAnalyticsEvent(name: string): name is AnalyticsEvent {
  return (ANALYTICS_EVENTS as readonly string[]).includes(name)
}
