import type { CharacterState } from '../character/state'
import type { RelationshipState } from '../relationship/types'
import type { SemanticEvent } from '../relationship/semantic'
import type { ContactChannel } from '../character/types'

/**
 * Event Rules — "무슨 일이 일어나야 하는가" 를 코드가 정한다. LLM 은 여기에 없다.
 * IF 조건 THEN 효과. 효과는 '먼저 연락할 의도' 가 대부분이고, delayMinutes 가 '언제' 를 스케줄러에 넘긴다.
 */
export type EventRuleContext = {
  relationship: RelationshipState
  characterState: CharacterState
  semanticEvents: SemanticEvent[]
  /** 사용자의 마지막 상호작용 후 경과 시간(분). 턴 안에서는 0. */
  idleMinutes: number
  turnCount: number
}

export type RealityEffect = { channel: ContactChannel; reason: string; urgency: number; delayMinutes: number }

export type EventRule = {
  id: string
  /** 세션에서 한 번만. */
  once?: boolean
  when: (c: EventRuleContext) => boolean
  effect: { realityIntent?: RealityEffect; memory?: string }
}

const has = (c: EventRuleContext, ...types: SemanticEvent['type'][]) => c.semanticEvents.some((e) => types.includes(e.type) && e.confidence >= 0.6)

export const EVENT_RULES: EventRule[] = [
  {
    id: 'jealousy_spike', once: true,
    when: (c) => c.relationship.jealousy >= 55 && has(c, 'mentioned_other_romantic_interest', 'drank_with_someone'),
    effect: { realityIntent: { channel: 'message', reason: '아까 말한 그 사람이 누구인지 계속 신경 쓰인다', urgency: 0.9, delayMinutes: 0 },
      memory: '사용자가 다른 사람 이야기를 꺼냈고, 캐릭터는 그것을 마음에 두고 있다.' },
  },
  {
    id: 'jealous_follow_up',
    when: (c) => c.relationship.jealousy > 70 && c.idleMinutes >= 30,
    effect: { realityIntent: { channel: 'message', reason: '질투가 가라앉지 않아 먼저 연락한다', urgency: 0.8, delayMinutes: 37 } },
  },
  {
    id: 'after_confession', once: true,
    when: (c) => has(c, 'confession') && c.relationship.attraction >= 50,
    effect: { realityIntent: { channel: 'message', reason: '고백을 들은 뒤 마음이 진정되지 않는다', urgency: 0.7, delayMinutes: 5 } },
  },
  {
    id: 'after_conflict', once: true,
    when: (c) => has(c, 'hostility', 'rejection') && c.characterState.stress >= 50,
    effect: { realityIntent: { channel: 'status', reason: '다툰 뒤 말없이 상태만 바뀐다', urgency: 0.5, delayMinutes: 2 } },
  },
  {
    id: 'cold_silence',
    when: (c) => c.relationship.emotionalDistance >= 70 && c.relationship.attachment >= 40 && c.idleMinutes >= 180,
    effect: { realityIntent: { channel: 'message', reason: '멀어진 채 오래 조용해서 먼저 말을 건다', urgency: 0.4, delayMinutes: 0 } },
  },
]

/** 발동한 규칙. once 규칙은 firedRules 에 있으면 건너뛴다. */
export function evaluateEventRules(c: EventRuleContext, rules: EventRule[] = EVENT_RULES): EventRule[] {
  return rules.filter((r) => !(r.once && c.characterState.firedRules.includes(r.id)) && r.when(c))
}
