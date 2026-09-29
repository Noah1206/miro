import { MOODS, type Mood } from '../character/mood'
import type { CharacterCore } from '../character/types'
import { SEMANTIC_EVENT_TYPES, type SemanticEvent, type SemanticEventType } from './semantic'

/**
 * 관계 성격표 — 같은 일에도 캐릭터마다 다르게 반응하고, 다르게 가까워진다 (2026-09-29 결정).
 *
 * 캐릭터를 저장할 때 AI 가 작성자의 설정 문장에서 한 번 만들고, 작성자가 편집기에서 고친다.
 * 대화 중에는 AI 를 부르지 않는다 — 규칙(rules·dynamics·stage·state·event)이 이 표를 읽을 뿐이라 같은 상황이면 같은 결과다.
 * 표에 없는 항목은 기본 규칙 그대로다. 값은 정해진 선택지 안에서만 움직이고, 한 턴 상한(±15)은 그대로 걸린다.
 */
export const REACTION_LEVELS = ['none', 'low', 'normal', 'high', 'extreme', 'averse'] as const
export type ReactionLevel = (typeof REACTION_LEVELS)[number]
/** 사건 표(RELATIONSHIP_RULES)의 한 줄에 곱하는 값. 싫어함(averse)은 좋은 뜻의 사건을 반만큼 반대로 받는다. */
const LEVEL_FACTOR: Record<ReactionLevel, number> = { none: 0, low: 0.5, normal: 1, high: 1.5, extreme: 2, averse: -0.5 }

/** 좋은 뜻의 사건. 이것만 '싫어함' 이 될 수 있고, '친구가 되는 계기' 가 될 수 있다. */
export const WELCOME_EVENTS = [
  'compliment', 'confession', 'expressed_longing', 'shared_secret', 'apologized', 'made_promise', 'asked_about_character', 'gave_excuse',
] as const satisfies readonly SemanticEventType[]
export type WelcomeEvent = (typeof WELCOME_EVENTS)[number]

export const PACES = ['fast', 'normal', 'slow'] as const
export type Pace = (typeof PACES)[number]
export const ROMANCE_PACES = ['fast', 'normal', 'slow', 'never'] as const
export type RomancePace = (typeof ROMANCE_PACES)[number]
export const FORGIVENESS_PACES = ['quick', 'normal', 'slow'] as const
export type ForgivenessPace = (typeof FORGIVENESS_PACES)[number]
/** 함께한 시간으로 더 자랄 수 있는 마음. 질투·거리감·끌림은 사건과 관계 종류로만 움직인다. */
export const GROWABLE = ['trust', 'attachment', 'protectiveness'] as const
export type Growable = (typeof GROWABLE)[number]
/** 먼저 연락하는 사건 규칙(event/rules 의 id). 캐릭터마다 끄거나 이유를 바꿀 뿐, 조건·채널은 바꾸지 않는다. */
export const REACH_OUT_RULES = ['jealousy_spike', 'jealous_follow_up', 'after_confession', 'after_conflict', 'after_scene', 'cold_silence'] as const
export type ReachOutRule = (typeof REACH_OUT_RULES)[number]

/** 표의 한 칸. 문장은 코드가 값에서 만든다 — 모델은 값과 근거 인용만 낸다. 작성자가 고친 칸(author)은 다시 만들 때도 남는다. */
export type ProfileItem<T> = { value: T; by: 'ai' | 'author'; quote?: string }

export type RelationshipProfile = {
  version: 1
  /** 표를 만든 설정의 지문. 설정이 바뀌면 다시 만든다. */
  sourceHash: string
  generatedAt: string
  reactions: Partial<Record<SemanticEventType, ProfileItem<ReactionLevel>>>
  grows: Partial<Record<Growable, ProfileItem<true>>>
  /** 아는 사이·친구가 되는 속도. */
  opening?: ProfileItem<Pace>
  /** 연애 감정으로 가는 속도. never 면 규칙이 연애 단계로 올리지 않는다. */
  romance?: ProfileItem<RomancePace>
  /** 사과를 받아 주는 문턱과 스트레스가 풀리는 속도. */
  forgiveness?: ProfileItem<ForgivenessPace>
  /** 친구가 되려면 이 일이 있어야 한다. */
  turningPoint?: ProfileItem<WelcomeEvent>
  /** 이 캐릭터가 그 기분을 드러내는 방식. 공통 설명(MOOD_GUIDE) 대신 프롬프트에 실린다. */
  moods: Partial<Record<Mood, ProfileItem<string>>>
  reachOut: Partial<Record<ReachOutRule, ProfileItem<{ on: boolean; reason: string }>>>
}

export const OPENING: Record<Pace, { acquaintanceTurn: number; acquaintanceTrust: number; friendTurn: number; friendTrust: number; friendAttachment: number }> = {
  fast: { acquaintanceTurn: 2, acquaintanceTrust: 30, friendTurn: 5, friendTrust: 42, friendAttachment: 18 },
  normal: { acquaintanceTurn: 3, acquaintanceTrust: 35, friendTurn: 8, friendTrust: 50, friendAttachment: 25 },
  slow: { acquaintanceTurn: 6, acquaintanceTrust: 42, friendTurn: 16, friendTrust: 60, friendAttachment: 35 },
}
export const ROMANCE: Record<Exclude<RomancePace, 'never'>, { ambiguousAttraction: number; ambiguousTrust: number; flirtingAttraction: number; flirtingTrust: number; flirtingTurn: number }> = {
  fast: { ambiguousAttraction: 30, ambiguousTrust: 42, flirtingAttraction: 50, flirtingTrust: 50, flirtingTurn: 8 },
  normal: { ambiguousAttraction: 40, ambiguousTrust: 50, flirtingAttraction: 60, flirtingTrust: 60, flirtingTurn: 16 },
  slow: { ambiguousAttraction: 50, ambiguousTrust: 60, flirtingAttraction: 70, flirtingTrust: 70, flirtingTurn: 32 },
}
/** exitTrust: 갈등·불신에서 사과로 돌아오는 신뢰 문턱. stressRelief: 턴마다 풀리는 스트레스. */
export const FORGIVENESS: Record<ForgivenessPace, { exitTrust: number; stressRelief: number }> = {
  quick: { exitTrust: 30, stressRelief: 6 }, normal: { exitTrust: 40, stressRelief: 4 }, slow: { exitTrust: 50, stressRelief: 2 },
}

type Profile = RelationshipProfile | null | undefined

export function reactionFactor(profile: Profile, type: SemanticEventType): number {
  return LEVEL_FACTOR[profile?.reactions[type]?.value ?? 'normal']
}
/** 캐릭터가 마음에 두는 사건만 — 무덤덤하거나 싫어하는 사건은 기분·단계·함께한 시간의 계기가 되지 않는다. */
export function feltEvents(events: SemanticEvent[], profile: Profile): SemanticEvent[] {
  return profile ? events.filter((e) => reactionFactor(profile, e.type) > 0) : events
}
/** 캐릭터가 싫어하는 좋은 뜻의 사건(예: 아부를 싫어하는 캐릭터의 칭찬). */
export function averseEvents(events: SemanticEvent[], profile: Profile): SemanticEvent[] {
  return profile ? events.filter((e) => reactionFactor(profile, e.type) < 0) : []
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const oneOf = <T extends string>(list: readonly T[]) => (v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)
function item<T>(raw: unknown, accept: (v: unknown) => v is T): ProfileItem<T> | undefined {
  if (!isObject(raw) || !accept(raw.value)) return undefined
  const quote = typeof raw.quote === 'string' && raw.quote.trim() ? raw.quote.trim().slice(0, 240) : undefined
  return { value: raw.value, by: raw.by === 'author' ? 'author' : 'ai', ...(quote ? { quote } : {}) }
}
function items<K extends string, T>(raw: unknown, keys: readonly K[], accept: (v: unknown, key: K) => v is T): Partial<Record<K, ProfileItem<T>>> {
  const out: Partial<Record<K, ProfileItem<T>>> = {}
  if (!isObject(raw)) return out
  for (const key of keys) {
    const parsed = item(raw[key], (v): v is T => accept(v, key))
    if (parsed) out[key] = parsed
  }
  return out
}
const text = (max: number) => (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

/**
 * 저장된 표를 읽는다. 모양이 틀린 칸은 버리고(그 칸은 기본 규칙), 뼈대가 틀리면 표 전체를 버린다.
 * 작성자가 폼으로 보낸 표도 이 함수를 지난다 — 선택지 밖의 값은 들어오지 못한다.
 */
export function parseRelationshipProfile(raw: unknown): RelationshipProfile | null {
  if (!isObject(raw) || raw.version !== 1 || typeof raw.sourceHash !== 'string' || typeof raw.generatedAt !== 'string') return null
  const welcome = oneOf(WELCOME_EVENTS)
  const opening = item(raw.opening, oneOf(PACES))
  const romance = item(raw.romance, oneOf(ROMANCE_PACES))
  const forgiveness = item(raw.forgiveness, oneOf(FORGIVENESS_PACES))
  const turningPoint = item(raw.turningPoint, welcome)
  return {
    version: 1, sourceHash: raw.sourceHash.slice(0, 128), generatedAt: raw.generatedAt.slice(0, 40),
    // 싫어함은 좋은 뜻의 사건에만 — 거짓말을 '싫어한다' 는 반대로 좋아한다는 뜻이 되어 버린다.
    reactions: items(raw.reactions, SEMANTIC_EVENT_TYPES, (v, key): v is ReactionLevel => oneOf(REACTION_LEVELS)(v) && (v !== 'averse' || welcome(key))),
    grows: items(raw.grows, GROWABLE, (v): v is true => v === true),
    ...(opening ? { opening } : {}), ...(romance ? { romance } : {}), ...(forgiveness ? { forgiveness } : {}), ...(turningPoint ? { turningPoint } : {}),
    moods: items(raw.moods, MOODS, text(160)),
    reachOut: items(raw.reachOut, REACH_OUT_RULES, (v): v is { on: boolean; reason: string } =>
      isObject(v) && typeof v.on === 'boolean' && typeof v.reason === 'string' && v.reason.length <= 100),
  }
}

/**
 * 새로 만든 표에 작성자가 고쳐 둔 칸을 얹는다. 설정 문장이 바뀌어 표를 다시 만들어도 작성자의 선택은 남는다.
 * ponytail: 작성자가 지운 칸은 기록이 남지 않아, 바뀐 설정으로 새 표가 같은 칸을 내면 다시 생긴다. 지운 칸을 지켜야 하면 삭제 표시를 둔다.
 */
export function keepAuthorItems(next: RelationshipProfile, previous: RelationshipProfile | null): RelationshipProfile {
  if (!previous) return next
  const merge = <K extends string, T>(a: Partial<Record<K, ProfileItem<T>>>, b: Partial<Record<K, ProfileItem<T>>>) => {
    const out = { ...a }
    for (const [key, value] of Object.entries(b) as Array<[K, ProfileItem<T> | undefined]>) if (value?.by === 'author') out[key] = value
    return out
  }
  const single = <T>(a: ProfileItem<T> | undefined, b: ProfileItem<T> | undefined) => (b?.by === 'author' ? b : a)
  const opening = single(next.opening, previous.opening), romance = single(next.romance, previous.romance)
  const forgiveness = single(next.forgiveness, previous.forgiveness), turningPoint = single(next.turningPoint, previous.turningPoint)
  return {
    ...next,
    reactions: merge(next.reactions, previous.reactions), grows: merge(next.grows, previous.grows),
    moods: merge(next.moods, previous.moods), reachOut: merge(next.reachOut, previous.reachOut),
    ...(opening ? { opening } : {}), ...(romance ? { romance } : {}), ...(forgiveness ? { forgiveness } : {}), ...(turningPoint ? { turningPoint } : {}),
  }
}

/**
 * 작성자가 쓴 캐릭터만 — 관계 성격표(AI 가 설정에서 만든 파생 값)를 뺀다.
 * 캐릭터를 모델에 통째로 보낼 때(검열·먼저 연락 문장)와 판(revision)에 고정할 때 쓴다. 표는 규칙만 읽는다 —
 * 모델에 실으면 몇 KB 가 매 턴 검열 입력에 붙고, 파생 값이 '작성된 설정' 으로 둔갑한다.
 */
export function authoredCharacter(c: CharacterCore): CharacterCore {
  const { relationshipProfile: _derived, ...personality } = c.personality
  return { ...c, personality }
}
/** 고정된 판의 캐릭터에 지금의 관계 성격표를 얹는다 — 표는 설정에서 파생돼 판과 따로 갱신된다(편집기에서만 고쳐도 반영된다). */
export function withRelationshipProfile(c: CharacterCore, profile: RelationshipProfile | null | undefined): CharacterCore {
  return { ...c, personality: { ...c.personality, relationshipProfile: profile ?? null } }
}
