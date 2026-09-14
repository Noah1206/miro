/**
 * Closed Alpha 관계 엔진 — 규칙 기반. AI 는 대사만 만들고, 관계는 여기서 우리 코드가 바꾼다.
 * 숫자는 화면에 절대 나가지 않는다. 캐릭터 말투·행동으로만 느껴진다.
 */
export type Stage = 'stranger' | 'interested' | 'close' | 'attached' | 'conflicted'
export type Mood = 'neutral' | 'happy' | 'jealous' | 'hurt' | 'angry' | 'curious'
export type Dim = 'affection' | 'trust' | 'jealousy' | 'anger' | 'curiosity'

export type RelationshipState = Record<Dim, number> & {
  relationshipStage: Stage
  currentMood: Mood
}

/** 유진은 이미 아는 사이 — 전화를 걸 만큼. 낯선 사람에서 시작하지 않는다. */
export const INITIAL_STATE: RelationshipState = {
  affection: 52, trust: 50, jealousy: 18, anger: 8, curiosity: 40,
  relationshipStage: 'close', currentMood: 'neutral',
}

type Rule = {
  id: string
  test: RegExp
  delta: Partial<Record<Dim, number>>
  /** 중요한 사건만 기억으로 남긴다 — 프롬프트에 그대로 들어간다. */
  memory?: string
  /** 처음 걸리면 'wow' — 사용자가 감정 변화를 느낄 만한 순간. */
  wow?: boolean
}

const RULES: Rule[] = [
  { id: 'other_person', test: /(다른|딴)\s*(남자|여자|사람|애)|소개팅|썸|전\s?(남친|여친|남자친구|여자친구)|남사친|여사친|데이트/,
    delta: { jealousy: 18, trust: -3, curiosity: 5 }, memory: '사용자가 오늘 다른 사람과 만났다고 말했다.', wow: true },
  { id: 'drink_together', test: /(술|맥주|소주|한잔|와인).{0,12}(같이|랑|과|와|하고)|(같이|랑|과|와|하고).{0,12}(술|맥주|소주|한잔|와인)/,
    delta: { jealousy: 12, curiosity: 4 }, memory: '사용자가 오늘 누군가와 술을 마셨다고 말했다.', wow: true },
  { id: 'affection', test: /보고\s?싶|좋아해|좋아한다|사랑|(네|니|너)\s?생각|생각났|예쁘|귀여|잘생|보고싶/,
    delta: { affection: 10, trust: 3, anger: -5, jealousy: -5 }, memory: '사용자가 유진에게 호감을 표현했다.', wow: true },
  { id: 'apology', test: /미안|잘못했|사과할/, delta: { trust: 5, anger: -12, jealousy: -6 }, memory: '사용자가 사과했다.' },
  { id: 'rude', test: /꺼져|닥쳐|시끄러|짜증\s?나|뭐래|귀찮|신경\s?꺼|상관\s?없|알아서\s?해|됐어\s?그만/,
    delta: { anger: 18, affection: -6, trust: -4 }, memory: '사용자가 유진에게 차갑게 말했다.', wow: true },
  { id: 'on_purpose', test: /일부러/, delta: { anger: 12, jealousy: 4, curiosity: 6 }, memory: '사용자가 일부러 전화를 안 받았다고 말했다.', wow: true },
  { id: 'friends', test: /친구(들)?\s?(이랑|랑|와|과|하고|이)/, delta: { curiosity: 6, jealousy: 3 } },
  { id: 'busy', test: /야근|과제|시험|바빠|바빴|회의|출장|알바/, delta: { trust: 2, anger: -3 } },
  { id: 'question', test: /\?|뭐\s?해|뭐했|어땠|어때|왜\s/, delta: { curiosity: 4 } },
]

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

export function deriveStage(s: Record<Dim, number>): Stage {
  if (s.anger >= 55 || (s.jealousy >= 60 && s.trust < 45)) return 'conflicted'
  if (s.affection >= 75 && s.trust >= 60) return 'attached'
  if (s.affection >= 50) return 'close'
  if (s.affection >= 25) return 'interested'
  return 'stranger'
}

export function deriveMood(s: Record<Dim, number>, delta: Partial<Record<Dim, number>>): Mood {
  if (s.anger >= 45) return 'angry'
  if (s.jealousy >= 45) return 'jealous'
  if (s.anger >= 20 || (s.jealousy >= 35 && s.trust < 50)) return 'hurt'
  if ((delta.affection ?? 0) > 0 && s.affection >= 55) return 'happy'
  if (s.curiosity >= 55) return 'curious'
  return 'neutral'
}

export type Applied = {
  state: RelationshipState
  delta: Partial<Record<Dim, number>>
  memories: string[]
  fired: string[]
  /** 이 턴에서 사용자가 느낄 만한 변화가 있었는가. */
  wow: boolean
}

/** 사용자 한 마디를 관계에 반영한다. 순수 함수 — 같은 입력이면 같은 결과. */
export function applyUserMessage(prev: RelationshipState, text: string): Applied {
  const delta: Partial<Record<Dim, number>> = {}
  const memories: string[] = []
  const fired: string[] = []
  let wow = false
  const add = (d: Partial<Record<Dim, number>>) => { for (const [k, v] of Object.entries(d)) delta[k as Dim] = (delta[k as Dim] ?? 0) + v! }

  for (const r of RULES) {
    if (!r.test.test(text)) continue
    fired.push(r.id); add(r.delta)
    if (r.memory) memories.push(r.memory)
    if (r.wow) wow = true
  }
  // 시간이 지나면 화·질투는 가라앉는다 — 한 턴에 조금씩.
  add({ anger: -3, jealousy: -2, curiosity: -1 })

  const next: Record<Dim, number> = {
    affection: clamp(prev.affection + (delta.affection ?? 0)),
    trust: clamp(prev.trust + (delta.trust ?? 0)),
    jealousy: clamp(prev.jealousy + (delta.jealousy ?? 0)),
    anger: clamp(prev.anger + (delta.anger ?? 0)),
    curiosity: clamp(prev.curiosity + (delta.curiosity ?? 0)),
  }
  const big = Object.values(delta).some((v) => Math.abs(v ?? 0) >= 10)
  return {
    state: { ...next, relationshipStage: deriveStage(next), currentMood: deriveMood(next, delta) },
    delta, memories, fired, wow: wow || big,
  }
}
