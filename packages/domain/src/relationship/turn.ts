import { DEFAULT_CHARACTER_STATE, deriveCharacterState, type CharacterState } from '../character/state'
import type { CharacterCore } from '../character/types'
import { applyRelationshipDelta } from './apply'
import { addDelta, bondingCurveOf, closeness, companionshipDelta, scaleCloser } from './dynamics'
import { deltaFromSemanticEvents } from './rules'
import type { SemanticEvent } from './semantic'
import { nextRelationshipStage } from './stage'
import type { RelationshipDelta, RelationshipState } from './types'

/**
 * 한 턴의 관계 반응. 사건이 준 변화(성격표·성향 보정) → 친해지는 곡선 → 함께한 시간 → 적용 → 단계 → 기분을 관계가 스스로 계산한다.
 * 조율자(engine/orchestrator)는 "이 사건들에 반응해" 라고만 묻고 결과를 받는다 — 계산 단계를 알지 않는다(2026-09-29 평가: 협력·자율성).
 * 순수 함수. delta.stage 에 이번 턴의 단계가 들어 있다.
 */
export function relationshipTurn(input: {
  character: CharacterCore
  relationship: RelationshipState
  characterState?: CharacterState
  events: SemanticEvent[]
  turn: number
  userInput: string
}): { delta: RelationshipDelta; relationship: RelationshipState; characterState: CharacterState } {
  const { personality } = input.character
  const profile = personality.relationshipProfile ?? null
  const curve = personality.bonding ?? bondingCurveOf(personality)
  // 사건이 움직인 만큼은 성격의 곡선이 키우거나 줄이고, 나쁜 일이 없던 턴은 함께한 시간만큼 가까워진다 (dynamics).
  const delta = addDelta(
    scaleCloser(deltaFromSemanticEvents(input.events, personality, profile), curve, closeness(input.relationship)),
    companionshipDelta({ curve, relationship: input.relationship, events: input.events, turn: input.turn, userInput: input.userInput, profile }))
  const relationship = applyRelationshipDelta(input.relationship, delta)
  delta.stage = nextRelationshipStage(input.relationship.stage, relationship, input.events, input.turn, profile)
  relationship.stage = delta.stage
  // 이번 턴의 관계(규칙 적용 후)로 기분을 정한다 — 모델은 수치가 아니라 기분을 본다.
  const characterState = deriveCharacterState(input.characterState ?? DEFAULT_CHARACTER_STATE, relationship, input.events, profile)
  return { delta, relationship, characterState }
}
