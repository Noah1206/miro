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

export type SuppressReason =
  | 'quiet_hours' | 'channel_disabled' | 'cooldown'
  | 'max_pending' | 'no_motivation' | 'outside_active_hours'

/** AI 가 제안하는 선연락 의도. 실제 발송 여부는 Evaluator 가 결정한다. */
export type RealityIntent = {
  channel: ContactChannel
  reason: string
  urgency: number // 0-1
}

export type NotificationSettings = {
  pushEnabled: boolean
  voiceCallEnabled: boolean
  videoCallEnabled: boolean
  quietHoursEnabled: boolean
  quietHoursStart: string // 'HH:MM'
  quietHoursEnd: string
}
