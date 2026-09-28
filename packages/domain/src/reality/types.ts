import type { ContactChannel } from '../character/types'

export type RealityContact = {
  id: string
  sessionId: string
  channel: ContactChannel
  /** 중복 발송 차단 키. (sessionId, dedupeKey) UNIQUE. */
  dedupeKey: string
  payload: Record<string, unknown>
  status: 'pending' | 'sent' | 'opened' | 'suppressed'
  suppressedReason: SuppressReason | null
  createdAt: Date
  sentAt: Date | null
}

export type SuppressReason = 'cooldown' | 'max_pending' | 'no_motivation' | 'outside_active_hours' | 'busy'

/** AI 가 제안하는 선연락 의도. 실제 발송 여부는 Evaluator 가 결정한다. */
export type RealityIntent = {
  channel: ContactChannel
  reason: string
  urgency: number // 0-1
  /** 스케줄러가 이 시각 전에는 보내지 않는다 (ISO). 없으면 유휴 시간 규칙을 따른다. */
  notBefore?: string
  /**
   * 무엇에 대한 응답인가. user_message = 사용자가 보낸 문자에 늦게 답하는 것(동기·쿨다운 검사 없음 — 답장은 스팸이 아니다),
   * call = 못 받은/끊긴 전화의 후속(성격·관계로 이미 걸렀다 — 동기 검사 없음).
   */
  answers?: 'user_message' | 'call'
}
