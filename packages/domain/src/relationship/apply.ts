import { POLICY } from '@miro/config'
import {
  RELATIONSHIP_DIMENSIONS,
  type RelationshipDelta,
  type RelationshipState,
} from './types'

const { deltaClampPerTurn, dimensionMin, dimensionMax } = POLICY.relationship

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/**
 * Relationship Delta 적용.
 *
 * 불변식:
 *  1. 한 턴 변화량은 ±deltaClampPerTurn 로 제한 (AI 가 trust +10000 을 반환해도 무시).
 *  2. 각 차원은 [0,100] 으로 clamp.
 *  3. 값은 감소할 수 있다 — 관계 후퇴는 정상 동작이다.
 *  4. 과거의 높은 수치가 현재 갈등을 무효화하지 않는다 (누적 보정 없음).
 */
export function applyRelationshipDelta(
  current: RelationshipState,
  delta: RelationshipDelta,
): RelationshipState {
  const next: RelationshipState = { ...current }

  for (const dim of RELATIONSHIP_DIMENSIONS) {
    const raw = delta[dim]
    if (raw === undefined) continue
    const limited = clamp(raw, -deltaClampPerTurn, deltaClampPerTurn)
    next[dim] = clamp(current[dim] + limited, dimensionMin, dimensionMax)
  }

  if (delta.stage !== undefined) next.stage = delta.stage

  next.version = current.version + 1
  next.updatedAt = new Date()
  return next
}

/**
 * 성향에 따른 delta 조정.
 * 같은 사용자 행동이라도 캐릭터 성격에 따라 다른 변화량이 나와야 한다 (지시서 §11-A).
 */
export function modulateByPersonality(
  delta: RelationshipDelta,
  personality: { jealousy: number; emotionalExpression: number },
): RelationshipDelta {
  const out: RelationshipDelta = { ...delta }

  if (out.jealousy !== undefined) {
    // 질투 성향이 낮은 캐릭터는 같은 상황에서도 질투가 덜 오른다.
    out.jealousy = Math.round(out.jealousy * (0.5 + personality.jealousy / 100))
  }
  // 감정 표현이 억제된 캐릭터는 정서 차원의 변화폭이 완만하다.
  const expressiveness = 0.5 + personality.emotionalExpression / 100
  for (const dim of ['attraction', 'attachment', 'emotionalDistance'] as const) {
    if (out[dim] !== undefined) out[dim] = Math.round(out[dim]! * expressiveness)
  }
  return out
}
