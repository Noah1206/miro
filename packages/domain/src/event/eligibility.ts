import { POLICY } from '@miro/config'
import type { EventCandidate, EventType, SimulationEvent } from './types'

export type EligibilityInput = {
  candidate: EventCandidate
  activeEvents: SimulationEvent[]
  resolvedEvents: SimulationEvent[]
  currentTurn: number
}

export type EligibilityResult =
  | { eligible: true; score: number }
  | { eligible: false; reason: BlockReason }

export type BlockReason =
  | 'max_active_events'
  | 'cooldown'
  | 'duplicate_active'
  | 'below_threshold'

/**
 * 사건 발생 가능 여부 판정.
 *
 * 절대 사용하지 않는 입력: 가입 경과일, 절대 턴 수 자체.
 * 시간은 cooldown 계산에만 쓰이며, 시간 경과가 스토리를 강제로 진행시키지 않는다.
 *
 * 조건을 만족해도 score 가 minSelectionScore 미만이면 발생하지 않는다 —
 * 사건 남발은 캐릭터를 인위적으로 느끼게 한다 (지시서 §12-C).
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const { candidate, activeEvents, resolvedEvents, currentTurn } = input

  if (activeEvents.length >= POLICY.event.maxActive) {
    return { eligible: false, reason: 'max_active_events' }
  }
  if (activeEvents.some((e) => e.type === candidate.type)) {
    return { eligible: false, reason: 'duplicate_active' }
  }
  if (isOnCooldown(candidate.type, resolvedEvents, currentTurn)) {
    return { eligible: false, reason: 'cooldown' }
  }

  const score = scoreCandidate(candidate, activeEvents.length)
  if (score < POLICY.event.minSelectionScore) {
    return { eligible: false, reason: 'below_threshold' }
  }
  return { eligible: true, score }
}

function isOnCooldown(
  type: EventType,
  resolved: SimulationEvent[],
  currentTurn: number,
): boolean {
  return resolved.some((e) => e.type === type && currentTurn < e.cooldownUntilTurn)
}

/** relevance / salience 조합. 이미 활성 사건이 있으면 신규 발생 압력을 낮춘다. */
function scoreCandidate(c: EventCandidate, activeCount: number): number {
  const base = c.relevance * 0.6 + c.salience * 0.4
  const crowding = 1 - activeCount * 0.25
  return base * Math.max(0, crowding)
}

/** 여러 후보 중 최대 1건만 선택. 한 턴에 사건이 쏟아지지 않게 한다. */
export function selectEvent(
  candidates: EventCandidate[],
  activeEvents: SimulationEvent[],
  resolvedEvents: SimulationEvent[],
  currentTurn: number,
): { candidate: EventCandidate; score: number } | null {
  let best: { candidate: EventCandidate; score: number } | null = null

  for (const candidate of candidates) {
    const r = evaluateEligibility({ candidate, activeEvents, resolvedEvents, currentTurn })
    if (!r.eligible) continue
    if (best === null || r.score > best.score) best = { candidate, score: r.score }
  }
  return best
}

export function nextCooldownTurn(currentTurn: number): number {
  return currentTurn + POLICY.event.cooldownTurns
}
