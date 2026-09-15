import { z } from 'zod'

/**
 * 한 번의 Structured Generation 으로 받는 전체 제안.
 *
 * 기본 대화는 1회 생성. 선택적 분석 작업은 별도 task와 모델로 실행하고 여기서 검증한다.
 * 이것은 제안일 뿐이며, Validator 를 통과하기 전에는 어떤 상태도 바뀌지 않는다.
 */

const RP_BLOCK_TYPES = ['dialogue', 'action', 'narrative', 'npc', 'world'] as const

export const RpBlock = z.object({
  type: z.enum(RP_BLOCK_TYPES),
  /** dialogue/npc 는 화자가 필요하다. narrative/action/world 는 null. */
  speaker: z.string().max(40).nullable(),
  text: z.string().min(1).max(2000).refine(text => !/(?:질투|신뢰|호감도|애착)\s*(?:수치|점수)\s*(?:가|는|:)?\s*\d|토큰\s*\d/i.test(text), 'internal state disclosure'),
})

/** 관계는 절대값이 아니라 delta 로만 제안할 수 있다 — AI 가 상태를 덮어쓰지 못하게. */
const delta = z.number().int().min(-100).max(100)

export const RelationshipDeltaProposal = z.object({
  trust: delta.optional(),
  attraction: delta.optional(),
  jealousy: delta.optional(),
  protectiveness: delta.optional(),
  emotionalDistance: delta.optional(),
  attachment: delta.optional(),
  stage: z.enum([
    'stranger', 'acquaintance', 'professional', 'friend', 'rivalry',
    'distrust', 'ambiguous', 'conflict', 'flirting', 'dating', 'lover',
  ]).optional(),
  /** 왜 이 변화가 일어났는지. 검증과 로깅에 사용한다. */
  reason: z.string().max(200).optional(),
})

export const WorldDeltaProposal = z.object({
  currentLocation: z.string().max(80).optional(),
  currentTime: z.string().max(40).optional(),
  worldStatus: z.string().max(200).optional(),
})

export const SceneDeltaProposal = z.object({
  location: z.string().max(80).optional(),
  time: z.string().max(40).optional(),
  mood: z.string().max(40).optional(),
  weather: z.string().max(40).optional(),
})

export const MemoryCandidateProposal = z.object({
  replaces: z.string().uuid().optional(),
  type: z.enum(['user_fact', 'promise', 'shared_event', 'relationship_change', 'preference', 'conflict', 'short_term_summary', 'world_fact']),
  content: z.string().min(2).max(300),
  importance: z.number().min(0).max(1),
  persistence: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
})

export const EventCandidateProposal = z.object({
  type: z.enum([
    'conflict', 'jealousy', 'business_trip', 'crisis', 'rival', 'scandal',
    'injury', 'npc_arrival', 'location_change', 'work', 'promise',
    'misunderstanding', 'reconciliation',
  ]),
  summary: z.string().min(2).max(300),
  /** 현재 서사 맥락 적합도 */
  relevance: z.number().min(0).max(1),
  /** 감정적 압력 */
  salience: z.number().min(0).max(1),
  participantNpcIds: z.array(z.string()).max(3).default([]),
})

/** 새 NPC 등장 제안. Validator 가 중복/한도를 검사한다. */
export const NpcIntroductionProposal = z.object({
  name: z.string().min(1).max(40),
  role: z.string().min(1).max(60),
  /** 등장 시점에 이 NPC 가 아는 것. 이후 행동의 경계가 된다. */
  knows: z.array(z.string().max(80)).max(5).default([]),
  relationshipToCharacter: z.string().max(60).default(''),
  relationshipToUser: z.string().max(60).default(''),
})

/** 진행 중인 사건의 상태 변화 제안. */
export const EventUpdateProposal = z.object({
  eventId: z.string(),
  status: z.enum(['active', 'escalated', 'resolved', 'cancelled']),
  /** 사건이 남긴 지속 상태. resolved 가 아니면 다음 턴에도 유지된다. */
  continuationState: z.record(z.unknown()).optional(),
  consequence: z.string().max(200).optional(),
})

export const NpcActionProposal = z.object({
  npcId: z.string(),
  action: z.string().min(1).max(300),
  /** NPC 가 실제로 아는 정보만 근거가 될 수 있다. Validator 가 대조한다. */
  basedOn: z.array(z.string().max(80)).max(5).default([]),
})

export const RealityIntentProposal = z.object({
  channel: z.enum([
    'message', 'push', 'photo', 'voice_message',
    'status', 'missed_call', 'voice_call', 'video_call',
  ]),
  reason: z.string().max(120),
  urgency: z.number().min(0).max(1),
})

export const SimulationProposal = z.object({
  rp: z.object({
    blocks: z.array(RpBlock).min(1).max(12),
  }),
  /** 이 응답에서 캐릭터가 느끼는 감정 (표시·로그용, 상태를 바꾸지 않는다). */
  emotion: z.enum(['neutral', 'happy', 'curious', 'hurt', 'jealous', 'angry', 'anxious']).optional(),
  /** 이 응답의 의도 한 줄 (예: '떠보기', '화제 돌리기'). */
  intent: z.string().max(80).optional(),
  worldDelta: WorldDeltaProposal.nullable().default(null),
  relationshipDelta: RelationshipDeltaProposal.nullable().default(null),
  sceneDelta: SceneDeltaProposal.nullable().default(null),
  memoryCandidates: z.array(MemoryCandidateProposal).max(3).default([]),
  eventCandidates: z.array(EventCandidateProposal).max(2).default([]),
  eventUpdates: z.array(EventUpdateProposal).max(3).default([]),
  npcIntroductions: z.array(NpcIntroductionProposal).max(2).default([]),
  npcActions: z.array(NpcActionProposal).max(3).default([]),
  realityIntent: RealityIntentProposal.nullable().default(null),
})

export type SimulationProposal = z.infer<typeof SimulationProposal>
export type RpBlock = z.infer<typeof RpBlock>
