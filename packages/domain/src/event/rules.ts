import type { CharacterState } from '../character/state'
import type { RelationshipState } from '../relationship/types'
import type { SemanticEvent } from '../relationship/semantic'
import type { ContactChannel } from '../character/types'
import { feltEvents, type ReachOutRule, type RelationshipProfile } from '../relationship/profile'

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
  /** 사용자가 마지막으로 말한 곳 — scene(만나서) / messenger(문자). 스케줄러만 채운다. */
  lastUserChannel?: 'scene' | 'messenger'
  /** 이번 장면(마지막 상호작용)에 대해 '잘 들어갔어?' 를 이미 보냈는가. 스케줄러만 채운다. */
  sceneFollowUpSent?: boolean
  /** 캐릭터의 관계 성격표 — 어떤 일에 먼저 연락하는지와 그 이유가 캐릭터마다 다르다. */
  profile?: RelationshipProfile | null
  /** 사용자 현지 날짜 'YYYY-MM-DD'. 하루 한 번 규칙(daily)은 firedRules 의 `${id}:${today}` 로 오늘 이미 발동했는지 본다. 스케줄러만 채운다. */
  today?: string
}

export type RealityEffect = { channel: ContactChannel; reason: string; urgency: number; delayMinutes: number }

export type EventRule = {
  id: string
  /** 세션에서 한 번만. */
  once?: boolean
  /** 하루(사용자 현지 날짜)에 한 번만. 발동 표시는 호출자가 firedRules 에 `${id}:${today}` 로 남긴다. */
  daily?: boolean
  when: (c: EventRuleContext) => boolean
  effect: { realityIntent?: RealityEffect; memory?: string }
}

const has = (c: EventRuleContext, ...types: SemanticEvent['type'][]) => feltEvents(c.semanticEvents, c.profile).some((e) => types.includes(e.type) && e.confidence >= 0.6)

export const EVENT_RULES: EventRule[] = [
  {
    id: 'jealousy_spike', once: true,
    when: (c) => c.relationship.jealousy >= 55 && has(c, 'mentioned_other_romantic_interest', 'drank_with_someone'),
    effect: { realityIntent: { channel: 'message', reason: '아까 말한 그 사람이 누구인지 계속 신경 쓰인다', urgency: 0.9, delayMinutes: 0 },
      memory: '사용자가 다른 사람 이야기를 꺼냈고, 캐릭터는 그것을 마음에 두고 있다.' },
  },
  {
    // 하루 한 번 — 질투는 시간이 지나도 줄지 않아, 전엔 사용자가 없는 동안 두 시간마다 다시 연락했다(10/2 감사).
    id: 'jealous_follow_up', daily: true,
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
    // 만나고 헤어진 뒤 — 장면이 끝나고 한 시간쯤 지나면 "잘 들어갔어?". 장면 하나에 한 번, 문자만 주고받았으면 안 한다, 낯선 사이엔 안 한다.
    id: 'after_scene',
    when: (c) => c.lastUserChannel === 'scene' && !c.sceneFollowUpSent
      && c.turnCount >= 4 && c.idleMinutes >= 45 && c.idleMinutes < 240 && c.relationship.trust >= 30 && c.relationship.emotionalDistance < 70,
    effect: { realityIntent: { channel: 'message', reason: '조금 전 만나고 헤어진 뒤 안부 — 잘 들어갔는지 묻고, 아까 나눈 이야기나 한 일을 짧게 되짚는다', urgency: 0.5, delayMinutes: 0 } },
  },
  {
    id: 'cold_silence',
    when: (c) => c.relationship.emotionalDistance >= 70 && c.relationship.attachment >= 40 && c.idleMinutes >= 180,
    effect: { realityIntent: { channel: 'message', reason: '멀어진 채 오래 조용해서 먼저 말을 건다', urgency: 0.4, delayMinutes: 0 } },
  },
]

/**
 * 발동한 규칙. once 규칙은 firedRules 에 있으면 건너뛴다.
 * 관계 성격표가 끈 규칙은 발동하지 않고, 표가 준 이유가 있으면 연락 이유를 그 캐릭터의 말로 바꾼다(조건·채널·시각은 그대로).
 */
export function evaluateEventRules(c: EventRuleContext, rules: EventRule[] = EVENT_RULES): EventRule[] {
  const own = (id: string) => c.profile?.reachOut[id as ReachOutRule]?.value
  return rules.filter((r) => !(r.once && c.characterState.firedRules.includes(r.id))
    && !(r.daily && c.today && c.characterState.firedRules.includes(`${r.id}:${c.today}`))
    && own(r.id)?.on !== false && r.when(c)).map((r) => {
    const reason = own(r.id)?.reason.trim()
    return reason && r.effect.realityIntent ? { ...r, effect: { ...r.effect, realityIntent: { ...r.effect.realityIntent, reason } } } : r
  })
}
