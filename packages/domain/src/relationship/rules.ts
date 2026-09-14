import { POLICY } from '@miro/config'
import { modulateByPersonality } from './apply'
import { RELATIONSHIP_DIMENSIONS, type RelationshipDelta } from './types'
import type { SemanticEvent, SemanticEventType } from './semantic'

/**
 * Relationship Rules — 의미 이벤트가 관계를 얼마나 움직이는지는 여기 숫자가 정한다. LLM 이 아니다.
 * 값은 0-100 차원의 delta. 확신(confidence)을 곱하고 성향(modulateByPersonality)으로 보정한 뒤 적용된다.
 */
export const RELATIONSHIP_RULES: Record<SemanticEventType, RelationshipDelta> = {
  compliment: { attraction: 4, emotionalDistance: -2 },
  confession: { attraction: 10, attachment: 6, emotionalDistance: -6 },
  expressed_longing: { attachment: 6, attraction: 4, emotionalDistance: -4, jealousy: -3 },
  rejection: { attachment: -8, attraction: -6, emotionalDistance: 10, trust: -3 },
  hostility: { trust: -6, emotionalDistance: 10, attachment: -3, attraction: -3 },
  ignored_character: { emotionalDistance: 5, attachment: -2 },
  mentioned_other_romantic_interest: { jealousy: 12, trust: -2, emotionalDistance: 3 },
  drank_with_someone: { jealousy: 8 },
  shared_secret: { trust: 6, attachment: 3, emotionalDistance: -3 },
  lied: { trust: -10, emotionalDistance: 6 },
  apologized: { trust: 5, emotionalDistance: -3, jealousy: -4 },
  made_promise: { trust: 2, attachment: 2 },
  broke_promise: { trust: -10, attachment: -4, emotionalDistance: 5 },
  asked_about_character: { attachment: 1, emotionalDistance: -1 },
  gave_excuse: { trust: 2, jealousy: -2 },
  deliberate_avoidance: { trust: -4, emotionalDistance: 6, jealousy: 3 },
}

/** 한 턴에 아무 사건도 없을 때의 자연 감쇠 — 질투는 가라앉고, 거리는 아주 조금 좁혀진다. */
const DECAY: RelationshipDelta = { jealousy: -2 }

/** LLM 이 제안한 delta 는 이만큼만 '뉘앙스' 로 얹을 수 있다. 큰 변화는 오직 규칙에서 나온다. */
export const LLM_NUANCE_LIMIT = 3

/** 의미 이벤트 → 코드가 정한 delta. */
export function deltaFromSemanticEvents(
  events: SemanticEvent[],
  personality: { jealousy: number; emotionalExpression: number },
): RelationshipDelta {
  const sum: RelationshipDelta = { ...DECAY }
  for (const e of events) {
    const rule = RELATIONSHIP_RULES[e.type]
    for (const dim of RELATIONSHIP_DIMENSIONS) {
      const v = rule[dim]
      if (v === undefined) continue
      sum[dim] = (sum[dim] ?? 0) + v * e.confidence
    }
  }
  const modulated = modulateByPersonality(sum, personality)
  for (const dim of RELATIONSHIP_DIMENSIONS) if (modulated[dim] !== undefined) modulated[dim] = Math.round(modulated[dim]!)
  return modulated
}

/** 코드 delta 가 주, LLM delta 는 ±LLM_NUANCE_LIMIT 안의 보정. stage 는 LLM 제안을 그대로 둔다 (validator 가 검사). */
export function mergeRelationshipDelta(code: RelationshipDelta, llm: RelationshipDelta): RelationshipDelta {
  const out: RelationshipDelta = { ...code }
  for (const dim of RELATIONSHIP_DIMENSIONS) {
    const n = llm[dim]
    if (n === undefined) continue
    const nuance = Math.max(-LLM_NUANCE_LIMIT, Math.min(LLM_NUANCE_LIMIT, n))
    out[dim] = (out[dim] ?? 0) + nuance
  }
  // 최종값도 한 턴 상한 안에 둔다 — 저장 시 apply 가 다시 clamp 하지만, 제안값과 적용값이 같아야 로그가 맞다.
  const limit = POLICY.relationship.deltaClampPerTurn
  for (const dim of RELATIONSHIP_DIMENSIONS) if (out[dim] !== undefined) out[dim] = Math.max(-limit, Math.min(limit, out[dim]!))
  if (llm.stage !== undefined) out.stage = llm.stage
  return out
}
