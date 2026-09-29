/**
 * 상태 전이 원장(agency-core-transition-plan §3.4). 서버가 승인·거부·보류한 변경 하나가 한 행이다.
 * 모델이 제출한 자유 형식 로그가 아니라 검증을 지난 결과만 적는다. 값은 상태 필드의 전후(장소·수치·사건 유형)이지
 * 대화 원문이 아니다 — 삭제 뒤 개인 데이터가 여기 남지 않게.
 */
export const TRANSITION_RULES = [
  // 적용
  'world_delta', 'scene_delta', 'event_created', 'event_updated', 'npc_introduced', 'npc_acted',
  'relationship_rules', 'relationship_appraisal', 'stage_rules', 'stage_derived', 'mood_derived', 'affect_appraisal',
  'reality_intent', 'goal_change', 'contact_dispatched', 'policy_switch',
  // 거부·보류(고정 코드)
  'chat_boundary', 'unapproved_mutation', 'validator_rejected', 'move_intent_held', 'arrival_unconfirmed', 'duplicate_effect',
] as const
export type TransitionRule = (typeof TRANSITION_RULES)[number]
export type TransitionStatus = 'applied' | 'rejected' | 'held'

export type StateTransitionRecord = {
  /** 바뀐(또는 바꾸려던) 상태 필드. 예: world.currentLocation, relationship.trust, event.<id>.status */
  field: string
  before?: unknown
  after?: unknown
  rule: TransitionRule
  status: TransitionStatus
  /** 실제 시각의 변경인가, 서사 속 시각의 변경인가. */
  clock: 'real' | 'narrative'
  /** 변경을 일으킨 행위자(캐릭터 id·'user'·'rules'). */
  actor: string
  target?: string
  /** 자율성 결정 id — 결정에서 파생된 변경이면. */
  decisionId?: string
  /** 발송·저장 결과 참조(연락 id 등). 원장은 결과를 만들어 내지 않고 가리키기만 한다. */
  outcomeRef?: string
}

export const transitionRecord = (r: StateTransitionRecord): StateTransitionRecord => r
