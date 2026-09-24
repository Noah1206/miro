/**
 * Relationship Dynamics — 대화하는 동안 관계가 어떻게 자라고, 그만큼 캐릭터가 언제 먼저 연락하는지.
 *
 * 2026-09-24 사용자 결정:
 *  - 사건(규칙·AI 분류)만이 아니라 함께 보낸 시간도 관계를 움직인다.
 *  - 친해지는 속도와 모양은 성격마다 다르다 — 가속·계단·꾸준·아주 느림.
 *  - 먼저 연락하는 문턱과 간격은 관계성(연애·친구·일·긴장·처음)과 성격, 지금의 친밀도로 매번 다시 정한다.
 *
 * 숫자는 여기서만 정한다. 모델은 관계 숫자를 제안하지 않는다(docs/MIRO_AI_PLATFORM.md §8).
 * 값은 체감 측정 전 임시값이다 — 바꾸면 docs/relationship-dynamics.md 의 표를 다시 뽑는다.
 */
import { RELATIONSHIP_DIMENSIONS, type RelationshipDelta, type RelationshipDimension, type RelationshipStage, type RelationshipState } from './types'
import type { SemanticEvent, SemanticEventType } from './semantic'

export const BONDING_CURVES = ['accelerating', 'stepwise', 'steady', 'slow'] as const
export type BondingCurve = (typeof BONDING_CURVES)[number]

export type RelationshipKind = 'romance' | 'friendship' | 'work' | 'tension' | 'new'

/** 관계성은 단계에서 나온다 — 친구가 썸이 되면 연애가 된다. */
const KIND_OF: Record<RelationshipStage, RelationshipKind> = {
  stranger: 'new', acquaintance: 'new', professional: 'work', friend: 'friendship',
  ambiguous: 'romance', flirting: 'romance', dating: 'romance', lover: 'romance',
  rivalry: 'tension', distrust: 'tension', conflict: 'tension',
}
export const relationshipKind = (stage: RelationshipStage): RelationshipKind => KIND_OF[stage] ?? 'new'

/** 작성자가 고른 곡선이 우선. 없으면 성향값으로 정한다 — 먼저 다가가고 솔직하면 가속, 둘 다 낮으면 아주 느림, 감정을 절제하면 계단. */
export function bondingCurveOf(p: { initiative: number; emotionalExpression: number }, authored?: unknown): BondingCurve {
  if (typeof authored === 'string' && (BONDING_CURVES as readonly string[]).includes(authored)) return authored as BondingCurve
  if (p.initiative >= 65 && p.emotionalExpression >= 65) return 'accelerating'
  if (p.initiative <= 35 && p.emotionalExpression <= 35) return 'slow'
  if (p.emotionalExpression <= 35) return 'stepwise'
  return 'steady'
}

type Relation = Pick<RelationshipState, 'trust' | 'attraction' | 'attachment' | 'emotionalDistance' | 'stage'>

/** 0-100. 관계성마다 '가깝다'를 재는 차원이 다르다 — 연애는 애착·호감, 일과 긴장은 신뢰. */
export function closeness(r: Relation): number {
  const near = 100 - r.emotionalDistance
  switch (relationshipKind(r.stage)) {
    case 'romance': return (r.attachment + r.attraction + near) / 3
    case 'work': case 'tension': return (r.trust + near) / 2
    default: return (r.attachment + r.trust + near) / 3
  }
}

const NEGATIVE: readonly SemanticEventType[] = ['rejection', 'hostility', 'ignored_character', 'lied', 'broke_promise', 'deliberate_avoidance']
/** 계단형이 한 단계 오르는 순간. */
const KEY_MOMENTS: readonly SemanticEventType[] = ['confession', 'expressed_longing', 'shared_secret', 'made_promise', 'apologized', 'compliment']
const STEP = 5, STEP_EVERY = 8, SLOW_EVERY = 3

/** 곡선별 이번 턴의 한 걸음. 가속형은 가까울수록 커지고, 계단형은 특별한 순간이나 8턴마다 한 번에 오른다. */
function stride(curve: BondingCurve, near: number, turn: number, events: SemanticEvent[]): number {
  switch (curve) {
    case 'steady': return 1
    case 'slow': return turn % SLOW_EVERY === 0 ? 1 : 0
    case 'accelerating': return near < 30 ? 1 : near < 50 ? 2 : near < 70 ? 3 : 4
    case 'stepwise': return events.some(e => KEY_MOMENTS.includes(e.type)) || turn % STEP_EVERY === 0 ? STEP : 0
  }
}

/** 관계성마다 함께한 시간으로 자라는 차원. 거리는 모두 좁혀진다 — 긴장 관계는 거리만 조금씩 풀린다. */
const GROWS: Record<RelationshipKind, readonly RelationshipDimension[]> = {
  new: ['trust', 'attachment'], friendship: ['trust', 'attachment'], romance: ['attachment', 'attraction'], work: ['trust'], tension: [],
}

/** 함께 보낸 시간. 나쁜 일이 없는 대화다운 턴마다 성격의 곡선대로 가까워진다. "ㅇㅇ" 같은 턴은 세지 않는다. */
export function companionshipDelta(input: {
  curve: BondingCurve; relationship: Relation; events: SemanticEvent[]; turn: number; userInput: string
}): RelationshipDelta {
  if (input.userInput.replace(/\s/g, '').length < 6 || input.events.some(e => NEGATIVE.includes(e.type))) return {}
  const g = stride(input.curve, closeness(input.relationship), input.turn, input.events)
  if (!g) return {}
  const out: RelationshipDelta = { emotionalDistance: -g }
  for (const dim of GROWS[relationshipKind(input.relationship.stage)]) out[dim] = g
  return out
}

/** 곡선은 사건이 가까워지게 한 만큼도 바꾼다 — 아주 느린 성격은 반만, 가속형은 가까울수록 크게. 멀어지는 변화는 그대로. */
export function scaleCloser(delta: RelationshipDelta, curve: BondingCurve, near: number): RelationshipDelta {
  const factor = curve === 'slow' ? 0.5 : curve === 'accelerating' ? 1 + near / 100 : 1
  if (factor === 1) return delta
  const out: RelationshipDelta = { ...delta }
  for (const dim of ['trust', 'attraction', 'attachment'] as const) if ((out[dim] ?? 0) > 0) out[dim] = Math.round(out[dim]! * factor)
  if ((out.emotionalDistance ?? 0) < 0) out.emotionalDistance = Math.round(out.emotionalDistance! * factor)
  return out
}

/** 차원별로 더한다. 한 턴 상한은 적용할 때 apply 가 건다. */
export function addDelta(a: RelationshipDelta, b: RelationshipDelta): RelationshipDelta {
  const out: RelationshipDelta = { ...a }
  for (const dim of RELATIONSHIP_DIMENSIONS) if (b[dim] !== undefined) out[dim] = (out[dim] ?? 0) + b[dim]!
  return out
}

/** 오래 연락이 없을 때 먼저 연락할 만큼 가까운가. 관계성마다 문턱이 다르고, 먼저 다가가는 캐릭터일수록 낮다. */
const READY_AT: Record<RelationshipKind, number> = { romance: 35, friendship: 40, new: 40, work: 45, tension: 55 }
/** 이보다 마음이 멀면(싸운 뒤) 애착이 커도 그냥 먼저 연락하지 않는다 — 사건이 있어야 연락한다. */
const TOO_FAR = 70
export function readyToReachOut(r: Relation, initiativeLevel: number): boolean {
  return r.emotionalDistance <= TOO_FAR && closeness(r) >= READY_AT[relationshipKind(r.stage)] - (initiativeLevel - 50) / 5
}

/**
 * 몇 시간 연락이 없으면 먼저 연락하나. 작성자의 연락 빈도(0→72h, 100→6h)에서 출발해
 * 관계성(연애가 가장 짧다)·지금의 친밀도·연락 주도성으로 매번 다시 계산한다.
 */
const KIND_PACE: Record<RelationshipKind, number> = { romance: 0.6, friendship: 0.85, new: 1, work: 1.2, tension: 1.3 }
export function silenceHours(r: Relation, contactFrequency: number, initiativeLevel: number): number {
  const base = 72 - (contactFrequency / 100) * 66
  const near = Math.min(1.3, Math.max(0.5, 1.5 - closeness(r) / 80))
  const drive = 1.3 - (initiativeLevel / 100) * 0.6
  return base * KIND_PACE[relationshipKind(r.stage)] * near * drive
}
