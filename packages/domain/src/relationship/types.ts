/**
 * Relationship State — 다차원. 선형 Progress Bar 가 아니다.
 * 모든 수치는 내부용이며 UI 에 직접 노출하지 않는다 (명세서 4장 수용기준 4).
 */
export type RelationshipState = {
  id: string
  sessionId: string
  version: number

  trust: number             // 0-100
  attraction: number
  jealousy: number
  protectiveness: number
  emotionalDistance: number
  attachment: number

  /** 관계를 설명하는 Semantic State. 기능 unlock 조건으로 사용하지 않는다. */
  stage: RelationshipStage
  unresolvedEventIds: string[]
  updatedAt: Date
}

/**
 * Stage 는 게임 Level 이 아니다. 앞으로만 이동하지 않으며,
 * 로맨스로 수렴하지 않는 상태들을 포함한다.
 */
export type RelationshipStage =
  | 'stranger'
  | 'acquaintance'
  | 'professional'
  | 'friend'
  | 'rivalry'
  | 'distrust'
  | 'ambiguous'
  | 'conflict'
  | 'flirting'
  | 'dating'
  | 'lover'

export const RELATIONSHIP_DIMENSIONS = [
  'trust', 'attraction', 'jealousy',
  'protectiveness', 'emotionalDistance', 'attachment',
] as const

export type RelationshipDimension = (typeof RELATIONSHIP_DIMENSIONS)[number]

/** AI 는 절대값이 아니라 delta 만 제안할 수 있다. 상태 덮어쓰기를 구조적으로 차단. */
export type RelationshipDelta = Partial<Record<RelationshipDimension, number>> & {
  stage?: RelationshipStage
}
