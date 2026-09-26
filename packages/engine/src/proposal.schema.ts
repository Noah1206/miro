import { z } from 'zod'

/**
 * 한 번의 Structured Generation 으로 받는 전체 제안.
 *
 * 기본 대화는 1회 생성. 선택적 분석 작업은 별도 task와 모델로 실행하고 여기서 검증한다.
 * 이것은 제안일 뿐이며, Validator 를 통과하기 전에는 어떤 상태도 바뀌지 않는다.
 */

const RP_BLOCK_TYPES = ['dialogue', 'action', 'narrative', 'npc', 'world', 'thought'] as const

/**
 * 실측(2026-09-26, gemini-3.8-flash): 지시가 길어지면 블록을 `{"action":"토마스","text":"…"}` 처럼 종류 이름을 키로,
 * 화자를 값으로 쓴다. 내용은 멀쩡한데 모든 블록이 떨어져 턴이 실패했다. 종류 키가 정확히 하나일 때만 원래 모양으로 옮긴다.
 */
function normalizeBlock(v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v) || 'type' in v) return v
  const o = v as Record<string, unknown>
  const keys = RP_BLOCK_TYPES.filter((t) => t in o)
  if (keys.length !== 1) return v
  const speaker = o[keys[0]!]
  return { type: keys[0], speaker: typeof speaker === 'string' ? speaker : null, text: o.text }
}

export const RpBlock = z.preprocess(normalizeBlock, z.object({
  type: z.enum(RP_BLOCK_TYPES),
  /** dialogue/npc 는 화자가 필요하다. narrative/action/world 는 null. 모델은 null 대신 생략을 잘 한다 — 검증기가 처리한다. */
  speaker: z.string().max(40).nullable().default(null),
  text: z.string().min(1).max(2000).refine(text => !/(?:질투|신뢰|호감도|애착)\s*(?:수치|점수)\s*(?:가|는|:)?\s*\d|토큰\s*\d/i.test(text), 'internal state disclosure'),
}))

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
  /**
   * 기억 그래프의 엣지. 없으면 content 에서 뽑는다.
   * 모델이 배열 대신 "성수동, 이사" 같은 문자열을 주는 일이 잦다 — 태그 하나 때문에
   * 턴 전체를 버리지 않도록 받아서 쪼갠다.
   */
  tags: z.preprocess(
    (v) => typeof v === 'string' ? v.split(/[,·]/).map((t) => t.trim()).filter(Boolean) : v,
    z.array(z.string().min(1).max(24)).max(5).catch([]),
  ).default([]),
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

/**
 * 제안 목록은 항목 단위로 받는다. 한 항목이 어긋났다고 대사까지 버리면
 * 유저는 부가 정보 하나 때문에 답을 못 받는다. 어긋난 항목만 떨어뜨리고 상한을 자른다.
 * 무엇이 떨어졌는지는 검증기 issues 가 아니라 여기서 사라지므로, 대사 품질 신호는 usage 의 ok 로 본다.
 */
export function lenientArray<T extends z.ZodTypeAny>(item: T, max: number) {
  return z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => item.safeParse(x).success).slice(0, max) : []),
    z.array(item).max(max),
  ).default([])
}

export const SimulationProposal = z.object({
  /** 대사만이 이 응답의 필수 부분이다. 블록 하나가 어긋나면 그 블록만 버리되, 남는 것이 없으면 실패다. */
  rp: z.object({
    blocks: lenientArray(RpBlock, 12).pipe(z.array(RpBlock).min(1)),
  }),
  /** 이 응답에서 캐릭터가 느끼는 감정 (표시·로그용, 상태를 바꾸지 않는다). 모르는 값은 없는 것으로. */
  emotion: z.enum(['neutral', 'happy', 'curious', 'hurt', 'jealous', 'angry', 'anxious']).optional().catch(undefined),
  /** 이 응답의 의도 한 줄 (예: '떠보기', '화제 돌리기'). */
  intent: z.string().max(80).optional().catch(undefined),
  worldDelta: WorldDeltaProposal.nullable().default(null).catch(null),
  /** 어긋난 delta 는 적용되지 않는다 — null 이면 엔진의 규칙 delta 만 남는다. 스키마가 턴을 버릴 이유는 아니다. */
  relationshipDelta: RelationshipDeltaProposal.nullable().default(null).catch(null),
  sceneDelta: SceneDeltaProposal.nullable().default(null).catch(null),
  memoryCandidates: lenientArray(MemoryCandidateProposal, 3),
  eventCandidates: lenientArray(EventCandidateProposal, 2),
  eventUpdates: lenientArray(EventUpdateProposal, 3),
  npcIntroductions: lenientArray(NpcIntroductionProposal, 2),
  npcActions: lenientArray(NpcActionProposal, 3),
  realityIntent: RealityIntentProposal.nullable().default(null).catch(null),
})

export type SimulationProposal = z.infer<typeof SimulationProposal>
export type RpBlock = z.infer<typeof RpBlock>
