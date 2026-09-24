import { POLICY } from '@miro/config'
import type { ContactChannel, ContactProfile } from '../character/types'
import type { RelationshipState } from '../relationship/types'
import type { SimulationEvent } from '../event/types'
import type { RealityContact, RealityIntent, SuppressReason } from './types'

export type RealityInput = {
  intent: RealityIntent
  contactProfile: ContactProfile
  personality: { initiative: number; emotionalExpression: number }
  relationship: RelationshipState
  activeEvents: SimulationEvent[]
  /** 사용자 IANA 시간대. 캐릭터의 활동 시간은 사용자 현지 시각으로 판정한다. */
  timeZone: string
  lastContactAt: Date | null
  pendingContacts: RealityContact[]
  now: Date
}

export type RealityDecision =
  | { send: true; channel: ContactChannel; dedupeKey: string }
  | { send: false; reason: SuppressReason }

/**
 * 선연락 발송 여부 판정.
 *
 * 이 함수는 "가입 N시간 후" 같은 절대 시간을 입력으로 받지 않는다.
 * 오직 "지금 이 캐릭터가 사용자에게 연락할 동기가 존재하는가" 만 판단한다.
 *
 * 하나의 관계 수치로 판단하지 않는다 — 싸운 상태 + 자존심 높은 캐릭터는 연락하지
 * 않을 수 있지만, 중요한 사건 + 높은 애착이면 싸운 상태여도 연락할 수 있다.
 *
 * 사용자 쪽 수신 설정(알림 끄기·통화 거절·야간 차단)은 없다 — 앱 밖 연락은 항상 받는다 (2026-09-24 결정).
 * 밤에 오지 않는 이유는 캐릭터의 활동 시간(기본 08~23시)이다.
 */
export function evaluateRealityContact(input: RealityInput): RealityDecision {
  const { intent, now } = input

  if (!inActiveHours(now, input.contactProfile, input.timeZone)) {
    return { send: false, reason: 'outside_active_hours' }
  }
  if (input.pendingContacts.length >= POLICY.reality.maxPending) {
    return { send: false, reason: 'max_pending' }
  }
  if (inCooldown(input.lastContactAt, now)) {
    return { send: false, reason: 'cooldown' }
  }
  // 침묵 연락은 deriveIntent 가 관계성·성격·친밀도로 이미 정했다 — 같은 관계를 다른 공식으로 다시 막지 않는다.
  if (input.intent.reason !== 'silence' && motivation(input) < POLICY.reality.motivationThreshold) {
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

  // 의도의 urgency 는 이미 "이 캐릭터가 지금 얼마나 연락하고 싶은가" 의 판단이므로 비중이 크다.
  return clamp01(
    initiative * 0.3 + bond * 0.3 + intent.urgency * 0.35 + eventPressure - distance * 0.35,
  )
}

function inActiveHours(now: Date, p: ContactProfile, timeZone: string): boolean {
  return inWindow(now, p.activeHours.start, p.activeHours.end, timeZone)
}

/** 'HH:MM' 구간 판정. 자정을 넘는 구간(23:00-08:00)을 지원하며 사용자 timezone 기준이다. */
function inWindow(now: Date, start: string, end: string, timeZone: string): boolean {
  const mins = localMinutes(now, timeZone)
  const s = toMinutes(start)
  const e = toMinutes(end)
  return s <= e ? mins >= s && mins < e : mins >= s || mins < e
}

/** 서버 시각이 아니라 사용자 현지 시각의 분 단위 값. */
export function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function inCooldown(last: Date | null, now: Date): boolean {
  if (last === null) return false
  return now.getTime() - last.getTime() < POLICY.reality.minGapMinutes * 60_000
}

/**
 * 같은 사건·채널·사유의 반복 발송을 차단하는 키.
 * 사건이 없는 사유(예: silence)는 날짜 버킷을 붙인다 — 영구 차단이 아니라 하루 한 번이다.
 */
function buildDedupeKey(input: RealityInput): string {
  const eventPart = input.activeEvents.map((e) => e.id).sort().join(',')
  const bucket = eventPart || input.now.toISOString().slice(0, 10)
  return `${input.intent.channel}:${bucket}:${input.intent.reason}`
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
