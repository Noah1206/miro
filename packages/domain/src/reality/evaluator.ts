import { POLICY } from '@miro/config'
import type { ContactChannel, ContactProfile } from '../character/types.js'
import type { RelationshipState } from '../relationship/types.js'
import type { SimulationEvent } from '../event/types.js'
import type { NotificationSettings, RealityContact, RealityIntent, SuppressReason } from './types.js'

export type RealityInput = {
  intent: RealityIntent
  contactProfile: ContactProfile
  personality: { initiative: number; emotionalExpression: number }
  relationship: RelationshipState
  activeEvents: SimulationEvent[]
  settings: NotificationSettings
  lastContactAt: Date | null
  pendingContacts: RealityContact[]
  now: Date
}

export type RealityDecision =
  | { send: true; channel: ContactChannel; dedupeKey: string }
  | { send: false; reason: SuppressReason }

/** 방해성 채널. Quiet Hours 에 차단 대상이 된다. */
const INTRUSIVE: ContactChannel[] = ['push', 'voice_call', 'video_call', 'missed_call']

/**
 * 선연락 발송 여부 판정.
 *
 * 이 함수는 "가입 N시간 후" 같은 절대 시간을 입력으로 받지 않는다.
 * 오직 "지금 이 캐릭터가 사용자에게 연락할 동기가 존재하는가" 만 판단한다.
 *
 * 하나의 관계 수치로 판단하지 않는다 — 싸운 상태 + 자존심 높은 캐릭터는 연락하지
 * 않을 수 있지만, 중요한 사건 + 높은 애착이면 싸운 상태여도 연락할 수 있다.
 */
export function evaluateRealityContact(input: RealityInput): RealityDecision {
  const { intent, settings, now } = input

  if (!isChannelAllowed(intent.channel, settings)) {
    return { send: false, reason: 'channel_disabled' }
  }
  if (isIntrusive(intent.channel) && inQuietHours(now, settings)) {
    // Simulation State 는 그대로 진행하고 발송만 억제한다.
    return { send: false, reason: 'quiet_hours' }
  }
  if (!inActiveHours(now, input.contactProfile)) {
    return { send: false, reason: 'outside_active_hours' }
  }
  if (input.pendingContacts.length >= POLICY.reality.maxPending) {
    return { send: false, reason: 'max_pending' }
  }
  if (inCooldown(input.lastContactAt, now)) {
    return { send: false, reason: 'cooldown' }
  }
  if (motivation(input) < 0.5) {
    return { send: false, reason: 'no_motivation' }
  }
  return { send: true, channel: intent.channel, dedupeKey: buildDedupeKey(input) }
}

/**
 * 연락 동기 계산.
 * 관계 수치 하나가 아니라 성향·애착·정서적 거리·활성 사건·긴급도의 조합이다.
 */
function motivation(input: RealityInput): number {
  const { relationship, personality, contactProfile, activeEvents, intent } = input

  const initiative = (personality.initiative + contactProfile.initiativeLevel) / 200
  const bond = (relationship.attachment + relationship.trust) / 200
  // 정서적 거리는 연락 동기를 낮춘다 — 싸운 뒤 먼저 연락하지 않는 행동의 근거.
  const distance = relationship.emotionalDistance / 100
  // 미해결 사건은 거리와 무관하게 연락 동기를 만든다.
  const eventPressure = activeEvents.length > 0 ? 0.3 : 0

  return clamp01(
    initiative * 0.3 + bond * 0.3 + intent.urgency * 0.25 + eventPressure - distance * 0.35,
  )
}

function isIntrusive(c: ContactChannel): boolean {
  return INTRUSIVE.includes(c)
}

function isChannelAllowed(c: ContactChannel, s: NotificationSettings): boolean {
  if (c === 'voice_call') return s.voiceCallEnabled
  if (c === 'video_call') return s.videoCallEnabled
  if (c === 'push' || c === 'missed_call') return s.pushEnabled
  return true
}

export function inQuietHours(now: Date, s: NotificationSettings): boolean {
  if (!s.quietHoursEnabled) return false
  return inWindow(now, s.quietHoursStart, s.quietHoursEnd)
}

function inActiveHours(now: Date, p: ContactProfile): boolean {
  return inWindow(now, p.activeHours.start, p.activeHours.end)
}

/** 'HH:MM' 구간 판정. 자정을 넘는 구간(23:00-08:00)을 지원한다. */
function inWindow(now: Date, start: string, end: string): boolean {
  const mins = now.getHours() * 60 + now.getMinutes()
  const s = toMinutes(start)
  const e = toMinutes(end)
  return s <= e ? mins >= s && mins < e : mins >= s || mins < e
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function inCooldown(last: Date | null, now: Date): boolean {
  if (last === null) return false
  return now.getTime() - last.getTime() < POLICY.reality.minGapMinutes * 60_000
}

/** 같은 사건·채널에 대한 반복 발송을 차단하는 키. */
function buildDedupeKey(input: RealityInput): string {
  const eventPart = input.activeEvents.map((e) => e.id).sort().join(',') || 'none'
  return `${input.intent.channel}:${eventPart}:${input.intent.reason}`
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
