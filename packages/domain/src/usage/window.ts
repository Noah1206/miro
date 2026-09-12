import { POLICY, type Plan } from '@miro/config'
import type { UsageKind, UsageWindow, UsageDecision } from './types.js'

export function windowEnd(startedAt: Date): Date {
  return new Date(startedAt.getTime() + POLICY.usage.windowHours * 3600_000)
}

export function isWindowActive(w: UsageWindow, now: Date): boolean {
  return now < w.endsAt
}

export function limitFor(plan: Plan): number {
  return POLICY.usage.limits[plan]
}

export function costOf(kind: UsageKind, units = 1): number {
  return POLICY.usage.weights[kind] * units
}

/**
 * 새 사용량 창 생성. 호출 시점이 창 시작점이 된다.
 *
 * 주의: "사용량을 모두 소비한 시점부터 다시 5시간" 이 아니다.
 * 첫 AI Request 시각부터 5시간이며, 그 창이 끝난 뒤의 다음 Request 가 새 창을 연다.
 */
export function openWindow(userId: string, plan: Plan, now: Date): Omit<UsageWindow, 'id'> {
  return {
    userId,
    plan,
    startedAt: now,
    endsAt: windowEnd(now),
    consumed: 0,
    limit: limitFor(plan),
  }
}

/**
 * 사용 승인 판정.
 * 사용량이 0 이어도 Relationship / World / Event / Memory / Character 상태는 유지된다 —
 * 이 함수는 생성 요청만 거절하며 어떤 상태도 삭제하지 않는다.
 */
export function decide(
  window: UsageWindow,
  kind: UsageKind,
  units: number,
  now: Date,
): UsageDecision {
  if (!isWindowActive(window, now)) {
    throw new Error('expired window passed to decide(); open a new window first')
  }
  const cost = costOf(kind, units)
  if (window.consumed + cost > window.limit) {
    return { allowed: false, reason: 'limit_reached', plan: window.plan, resetsAt: window.endsAt }
  }
  return { allowed: true, window, cost }
}

/** 선연락/Push 가 사용량을 차감하는지는 정책값으로 제어한다 (명세서 정책 1: 무차감 우선). */
export function shouldChargeRealityContact(): boolean {
  return POLICY.usage.chargeRealityContact
}
