/**
 * Character Core — 안정적으로 유지되는 정체성.
 * AI 가 매 턴 성격을 새로 정의하지 못하도록 Dynamic State 와 분리한다.
 */
import type { LoreEntry } from './lore'
import type { BondingCurve } from '../relationship/dynamics'
import type { RelationshipProfile } from '../relationship/profile'

/** 스탯 하나(11/10, 크랙 스탯 설정) — 범위 안에서만 움직인다. description 은 AI 가 언제 얼마나 바꿀지 판단하는 설명. */
/** 엔딩 하나(11/10, 크랙 엔딩 설정) — 최소 턴이 지난 뒤 조건이 장면에서 충족되면 AI 가 결말 표식(— ENDING · 이름 —)을 남긴다. */
export type CharacterEnding = { name: string; grade: 'N' | 'R' | 'SR' | 'SSR'; minTurns: number; condition: string; epilogue?: string; hint?: string }

export type CharacterStat = { name: string; min: number; max: number; default: number; unit?: string; description: string }

/** AI 가 낸 새 스탯 값을 정의된 스탯·범위로 자른다. 모르는 이름·숫자 아닌 값은 버린다. */
export function clampStatValues(stats: CharacterStat[], current: Record<string, number>, proposed: Record<string, unknown> | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of stats) {
    const raw = proposed?.[s.name]
    const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : (current[s.name] ?? s.default)
    out[s.name] = Math.min(s.max, Math.max(s.min, Math.round(v)))
  }
  return out
}

export type CharacterCore = {
  id: string
  ownerId: string | null // null = 공식 캐릭터
  isOfficial: boolean

  identity: {
    name: string
    age: string | null
    nationality: string | null
    occupation: string | null
    mbti: string | null
  }

  personality: {
    personality: string
    /** 비공개 설정 — 유저에게 직접 밝히지 않고 행동으로만 드러나는 속마음·사정·규칙. 화면에 보이지 않는다. */
    secret?: string | null
    values: string | null
    speechStyle: string | null
    userNickname: string | null
    hobbies: string[]
    dislikes: string[]
    /** 0-100. 같은 행동에도 캐릭터마다 다른 반응을 만드는 성향값. */
    jealousy: number
    initiative: number
    emotionalExpression: number
    /** 친해지는 곡선. 없으면 성향값으로 정한다 (relationship/dynamics). */
    bonding?: BondingCurve
    /** 관계 성격표 — 사건 반응·단계·기분 표현·화해·먼저 연락이 캐릭터마다 다르다. 없으면 기본 규칙 (relationship/profile). */
    relationshipProfile?: RelationshipProfile | null
  }

  worldRole: {
    socialPosition: string | null
    startingContext: string | null
    /** 상황 예시 — 만들 때 선택 입력. 없으면 프롬프트에서 통째로 빠진다. */
    sampleDialogue?: Array<{ role: 'character' | 'user' | 'narrator'; text: string }>
    /** 로어북 — 매 턴이 아니라 유저 입력이 키워드를 건드린 턴에만 실린다. */
    lore?: LoreEntry[]
    /** 상태창 형식(11/10) — 매 답변 끝에 이 틀을 채워 붙인다. 없으면 상태창 없음. */
    statusFormat?: string
    /** 스탯(11/10) — 대화방마다 값이 움직이는 수치. */
    stats?: CharacterStat[]
    /** 엔딩(11/10) — 조건이 충족되면 결말 표식을 남긴다. */
    endings?: CharacterEnding[]
  }

  visualIdentityId: string | null
  contactProfileId: string | null
  /** Authored visual facts, shared by dialogue and media. Images alone are not inferred facts. */
  appearance?: Pick<CharacterVisualIdentity, 'baseFace' | 'bodyProfile' | 'hair' | 'styleTags' | 'expressionTendency' | 'outfitProfile'>
}

/**
 * 체형. 사용자가 캐릭터를 만들 때 고르는 값이라 열거형으로 고정한다 —
 * 자유 문장이면 사람마다 다르게 적히고 선택 UI 를 만들 수 없다.
 */
export const BUILD_TYPES = ['slim', 'average', 'muscular', 'heavy'] as const
export type BuildType = (typeof BUILD_TYPES)[number]

/** 선택지 라벨과, 이미지 프롬프트로 나갈 묘사. 한 곳에서만 정의한다. */
export const BUILD_PRESETS: Record<BuildType, { label: string; prompt: string }> = {
  slim: { label: '마름', prompt: 'slim and lean build, slender frame' },
  average: { label: '표준', prompt: 'average build, natural proportions' },
  muscular: {
    label: '근육질',
    // 옷을 입은 상태에서도 체격이 드러나야 한다 (사용자 요구).
    prompt: 'muscular athletic build, broad shoulders, defined chest and abs, physique visible through clothing',
  },
  heavy: { label: '과체중', prompt: 'heavyset build, soft and solid frame' },
}

/**
 * 성별. 체형과 함께 한 사람의 실루엣을 정하므로 같은 자리에 둔다.
 * 두 값만 둔다 — 사진 생성 프롬프트가 실제로 가르는 축이 이것뿐이고,
 * 그 밖의 표현은 외형 설명(detail)에 자유 문장으로 적는다.
 */
export const GENDER_TYPES = ['male', 'female'] as const
export type GenderType = (typeof GENDER_TYPES)[number]

/**
 * voice 는 통화 목소리(Gemini Live 기본 목소리) — 목소리를 고르는 칸이 생기기 전까지 성별로 정한다.
 * 2026-09-24 실측: 같은 문장의 기본 주파수 중앙값 Alnilam 123Hz · Kore 240Hz, 받아쓰기는 원문 그대로.
 */
export const GENDER_PRESETS: Record<GenderType, { label: string; prompt: string; voice: string }> = {
  male: { label: '남성', prompt: 'man', voice: 'Alnilam' },
  female: { label: '여성', prompt: 'woman', voice: 'Kore' },
}

/**
 * 외형 항목. 키를 고정해야 캐릭터마다 같은 기준으로 적히고,
 * 편집 화면을 입력란으로 만들 수 있으며, 프롬프트 품질이 흔들리지 않는다.
 * 비워 두면(null) 프롬프트에서 그 항목이 빠질 뿐 깨지지 않는다.
 */
export type BaseFace = {
  eyes: string | null
  nose: string | null
  jaw: string | null
  skin: string | null
  /** 흉터·점처럼 그 사람을 알아보게 하는 한 가지. */
  distinctive: string | null
}
export type HairProfile = { color: string | null; length: string | null; style: string | null }
export type BodyProfile = { build: BuildType; gender: GenderType; height: string | null; detail: string | null }

/** Character Visual Identity — Profile / AI Photo / Live Scene / Video Call 공통 기준. */
export type CharacterVisualIdentity = {
  id: string
  characterId: string
  version: number
  baseFace: Partial<BaseFace>
  bodyProfile: Partial<BodyProfile>
  hair: Partial<HairProfile>
  styleTags: string[]
  expressionTendency: string | null
  outfitProfile: Record<string, unknown>
  referenceSource: 'text' | 'ai_generated' | 'user_upload' | 'reference_image'
}

/** Contact Style — 선연락 판단의 캐릭터별 baseline. */
export type ContactProfile = {
  id: string
  characterId: string
  /** false 면 어떤 이유로도 먼저 연락하지 않는다. 없으면 켜진 것으로 본다. */
  enabled?: boolean
  contactFrequency: number      // 0-100
  replyDelayMinutes: number
  preferredChannel: ContactChannel
  callProbability: number       // 0-1
  videoCallProbability: number
  photoProbability: number
  voiceMessageProbability: number
  activeHours: { start: string; end: string } // 'HH:MM'
  initiativeLevel: number       // 0-100
}

export type ContactChannel =
  | 'message' | 'push' | 'photo' | 'voice_message'
  | 'status' | 'missed_call' | 'voice_call' | 'video_call'
