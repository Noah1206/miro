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

/** daily_cap = 이 캐릭터가 오늘(사용자 현지 날짜) 먼저 보낼 만큼 이미 보냈다 — 상한은 성격·관계로 캐릭터마다 다르다(2026-10-02). */
export type SuppressReason = 'cooldown' | 'max_pending' | 'no_motivation' | 'outside_active_hours' | 'busy' | 'daily_cap'

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
  /** 사건에서 나온 의도면 그 사건과 상태(`id:status`). 같은 사건·상태로는 한 번만 연락한다 — 그 뒤엔 다른 이유를 본다. */
  eventKey?: string
  /** 사건 규칙(EVENT_RULES)이 만든 의도면 그 규칙 id. 규칙 조건과 캐릭터의 관계 성격표가 이미 정했으므로 동기 검사를 다시 하지 않는다. */
  rule?: string
  /** 예약된 의도가 처음 막힌 시각(ISO). 답장이 아니면 오래 막힌 의도는 버린다 — 다른 연락을 가로막지 않게. */
  deferredSince?: string
  /** 이 의도로 발송을 시도하다 연속으로 실패한 횟수. 스케줄러가 간격을 늘리고, 답장이 아니면 끝내 버린다. */
  failures?: number
}
