/** 지시서 §41 의 퍼널 이벤트. 여기 없는 이름은 track 이 거부한다. */
export const ANALYTICS_EVENTS = [
  'signup', 'character_selected', 'character_created', 'rp_started', 'rp_message_sent',
  'event_triggered', 'scene_changed', 'reality_contact_sent', 'reality_contact_opened',
  'call_started', 'call_completed', 'call_unanswered', 'usage_limit_reached', 'upgrade_viewed', 'subscription_started',
  'recharge_purchased',
  // 11/8 퍼널(관리자 /funnel) — 나머지 단계는 각 표(users·roleplay_sessions·generated_media·bank_transfer_orders)에서 바로 읽는다.
  'home_viewed', 'unveil_enabled',
  // 11/9 웹소설 — 대화방이 결말에 닿음(AI 의 결말 표식).
  'story_ending',
  'archive_opened', 'session_archived', 'session_deleted', 'report_submitted', 'account_deleted',
  // 11/18 관리자 실시간 현황 — 로그인·로그아웃, 화면 이동(접속 신호가 주소가 바뀔 때만 남긴다, props: anonId·path·device).
  'login', 'logout', 'page_viewed',
  // 11/27 가입 퍼널 — 로그인 시트가 열림(props: anonId·path·next), 소셜 버튼을 누름(props: anonId·path·provider). 로그인 완료는 signup·login.
  'login_sheet_opened', 'login_provider_tapped',
  // Closed Alpha 퍼널 — 로그인 없는 체험. userId 는 null, props.alphaSession 으로 묶는다.
  'landing_view', 'experience_start', 'first_message_sent', 'third_message_sent',
  'wow_event_triggered', 'reality_message_seen', 'waitlist_view', 'waitlist_complete',
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
