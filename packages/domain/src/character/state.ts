import type { RelationshipState } from '../relationship/types'
import type { SemanticEvent } from '../relationship/semantic'

/**
 * Character State — 프로필(CharacterCore)은 잘 안 변하고, 이 상태는 턴마다 변한다.
 * 기분은 관계 수치와 방금 일어난 의미 이벤트에서 코드가 정한다. 프롬프트에는 수치 대신 이 기분과 행동 지침이 들어간다.
 */
export const MOODS = ['neutral', 'happy', 'curious', 'hurt', 'jealous', 'angry', 'anxious'] as const
export type Mood = (typeof MOODS)[number]

export type CharacterState = {
  mood: Mood
  /** 0-100. 스트레스가 높으면 말이 짧아지고 먼저 묻지 않는다. */
  stress: number
  energy: number
  currentGoals: string[]
  currentThoughts: string[]
  /** 한 번만 발동하는 사건 규칙의 기록 (세션 범위). */
  firedRules: string[]
}

export const DEFAULT_CHARACTER_STATE: CharacterState = {
  mood: 'neutral', stress: 20, energy: 70, currentGoals: [], currentThoughts: [], firedRules: [],
}

export const MOOD_GUIDE: Record<Mood, string> = {
  neutral: '평소 말투. 짧고 담백하게.',
  happy: '말투가 조금 풀린다. 장난을 살짝 섞되 티 나게 좋아하지는 않는다.',
  curious: '질문이 많아진다. 캐묻듯이, 하지만 관심을 들키지 않게.',
  hurt: '담담한 척한다. 한 박자 늦게, 짧게 반응한다. 괜찮다고 말하지만 괜찮지 않다.',
  jealous: '말이 짧아지고 되묻는다. 아까 사용자가 한 말을 다시 꺼낸다. 직접 질투한다고 말하지 않는다.',
  angry: '단답. 마침표로 끝낸다. 먼저 묻지 않는다.',
  anxious: '확인하는 질문을 한다. 답이 늦으면 신경 쓴다는 게 드러난다.',
}

const GOALS: Partial<Record<Mood, string>> = {
  jealous: '아까 말한 그 사람이 누구인지 알아낸다',
  hurt: '괜찮은 척하며 상대가 먼저 알아채길 기다린다',
  angry: '먼저 풀지 않는다',
  curious: '상대의 하루를 캐묻는다',
  happy: '들키지 않게 좋아한다',
  anxious: '상대가 멀어지지 않았는지 확인한다',
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const has = (events: SemanticEvent[], ...types: SemanticEvent['type'][]) => events.some((e) => types.includes(e.type) && e.confidence >= 0.6)

/** 이번 턴의 기분·스트레스를 정한다. 순수 함수. */
export function deriveCharacterState(prev: CharacterState, r: RelationshipState, events: SemanticEvent[]): CharacterState {
  let stress = prev.stress - 4
  if (has(events, 'hostility', 'rejection', 'broke_promise', 'lied')) stress += 18
  if (has(events, 'mentioned_other_romantic_interest', 'drank_with_someone', 'deliberate_avoidance')) stress += 10
  if (has(events, 'apologized', 'expressed_longing', 'confession', 'compliment')) stress -= 8
  stress = clamp(stress)

  let mood: Mood = 'neutral'
  if (has(events, 'hostility') || (stress >= 70 && r.trust < 40)) mood = 'angry'
  else if (r.jealousy >= 55 || has(events, 'mentioned_other_romantic_interest', 'drank_with_someone')) mood = 'jealous'
  else if (has(events, 'rejection', 'broke_promise', 'lied', 'deliberate_avoidance') || (r.trust < 30 && r.emotionalDistance > 65)) mood = 'hurt'
  else if (has(events, 'confession', 'expressed_longing', 'compliment') && r.attraction >= 30) mood = 'happy'
  else if (r.attachment >= 60 && r.emotionalDistance >= 55) mood = 'anxious'
  else if (has(events, 'asked_about_character', 'shared_secret') || r.attraction >= 60) mood = 'curious'

  const goal = GOALS[mood]
  return {
    mood, stress, energy: clamp(100 - stress / 2),
    currentGoals: goal ? [goal] : [],
    currentThoughts: events.slice(0, 2).map((e) => `방금 사용자가 ${describeEvent(e.type)}`),
    firedRules: prev.firedRules,
  }
}

function describeEvent(t: SemanticEvent['type']): string {
  const m: Record<SemanticEvent['type'], string> = {
    compliment: '칭찬했다', confession: '마음을 고백했다', expressed_longing: '보고 싶다고 했다', rejection: '거리를 두려 했다',
    hostility: '차갑게 말했다', ignored_character: '말을 무시했다', mentioned_other_romantic_interest: '다른 사람 이야기를 꺼냈다',
    drank_with_someone: '누군가와 술을 마셨다고 했다', shared_secret: '비밀을 털어놓았다', lied: '거짓말을 인정했다',
    apologized: '사과했다', made_promise: '약속했다', broke_promise: '약속을 어겼다', asked_about_character: '안부를 물었다',
    gave_excuse: '이유를 설명했다', deliberate_avoidance: '일부러 피했다고 했다',
  }
  return m[t]
}
