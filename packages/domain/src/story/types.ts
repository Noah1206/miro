/**
 * 오리지널 스토리(여러 인물·사건 6개·분기·결말·연락석)의 콘텐츠 정의와 회차 상태.
 * 정의는 서버만 읽는다 — 공개 화면에는 StoryPublic 만 간다. 상태 변경은 모델이 아니라 engine.ts 가 정의의 효과로만 만든다.
 */
export type StoryAudience = 'reverse_harem' | 'bl'
export type Val = string | number | boolean | null

export type VarDef =
  | { type: 'int'; min: number; max: number; init: number; label?: string }
  | { type: 'bool'; init: boolean; label?: string }
  | { type: 'set'; values: string[]; label?: string }
  | { type: 'enum'; values: string[]; init: string; label?: string }

/** 조건. 하나의 객체엔 한 종류만 쓴다. */
export type Cond =
  | { all: Cond[] } | { any: Cond[] } | { not: Cond }
  | { var: string; eq?: Val; gte?: number; lte?: number; has?: string; sizeGte?: number; sizeLt?: number }
  | { rel: string; trustGte?: number; affinityGte?: number; contact?: ContactPermission; relation?: string }
  | { done: string } | { current: string }
  | { chose: string; option: string }
  | { knows: string; fact: string }
  | { exclusiveOther: string }

export type Effect =
  | { set: string; value: Val }
  | { inc: string; by: number }
  | { add: string; value: string }
  | { trust: string; by?: number } // 인물 신뢰 +1(사건당 인물별 최대 +1). by 가 음수면 감소(명시된 약속 위반 등) — 0 아래로는 안 내려간다.
  | { affinity: string; by?: number } // 선택이 연애 의사 표현일 때 호감 +1(사건당 1회), 철회는 음수
  | { if: Cond; then: Effect[]; else?: Effect[] } // 조건부 효과
  | { reveal: string; to: string[] } // 'player' 또는 인물 키
  | { note: string } // 기록에 남길 사건 사실(원장 노트)

export type StoryOption = {
  id: string
  /** 유저에게 보여 줄 수 있는 예시 문구. 버튼은 입력 칸을 채울 뿐이다. */
  hint: string
  /** 해석기에게만 주는 뜻(공개 안 함). */
  meaning: string
  requires?: Cond
  /** requires 가 안 맞을 때 장면에서 설명할 이유. */
  unmet?: string
  effects: Effect[]
  /** 고를 값이 있는 선택(예: 확보할 증거 하나). 서버가 choices 와 이미 가진 값을 확인한다. */
  pick?: { add: string; choices: string[]; reveal?: Record<string, string> }
  /** 사건을 끝내는가(기본 true). false 면 사건 안에 머문다. */
  completes?: boolean
  /** 결말 사건의 진로 선택이면 이 값을 outcomeVar 에 넣는다. */
  outcome?: string
  /** 장면 서술용 결과 요약(서버 → 서술 모델). 현재 사건일 때만 전달된다. */
  result: string
}

export type StoryEvent = {
  id: string
  /** 완료 뒤에만 진행 표시에 보이는 제목. */
  title: string
  goal: string
  /** 서술 모델에게만, 이 사건이 현재일 때만 주는 상황. */
  situation: string
  cast: string[]
  options: StoryOption[]
  /** 완료 시 어느 선택이든 적용(예: E5 자백). */
  always?: Effect[]
  /** 대화만으로 신뢰 +1 이 가능한 인물(약속·증거·협력 범위를 확인한 명시적 대화). */
  conversationTrust?: string[]
  next: string | null
  /** 결말 사건: 진로(outcomeVar)와 인물별 관계 선택이 모두 끝나야 회차가 끝난다. */
  final?: boolean
}

export type StoryCharacter = {
  key: string
  name: string
  age: number
  /** 공개 프로필 */
  look: string
  /** 공개 프로필 사진 경로(없으면 글자 자리표시) */
  image?: string
  publicPersona: string
  startingRelation: string
  /** 비공개: 말투·욕망·경계·지식 제한 지시문 */
  prompt: string
  lines: { distance: string; trust: string; conflict: string }
  /** 말투 예시 중 비밀을 암시하는 줄은 조건이 맞을 때만 모델에 보낸다. */
  lineGates?: Partial<Record<'distance' | 'trust' | 'conflict', Cond>>
  schedule: string
  /** 비공개: 시작 시점에 이 인물이 아는 사실 id */
  knows: string[]
  /** 결말 관계 후일담(관계 진행 시) */
  romanceEpilogue: string
}

export type ContactPermission = 'unset' | 'allowed' | 'stopped'

export type ContactRule = {
  id: string
  /** 회차 안 1회 키 */
  key: string
  speaker: string
  when: Cond
  /** 준비 시점. realMinutes: 조건 성립 후 현실 분. nextScene: 이야기 장면이 한 번 더 진행된 뒤. */
  delay: { realMinutes: number } | { nextScene: true }
  cancelIf: Cond
  text: string
}

export type StoryEnding = { id: string; title: string; when: Cond; summary: string }

/** 공개 입장 안내. 현재의 배경만 담고 사건의 진실·미래 전개는 담지 않는다. */
export type StoryEntry = {
  world: { title: string; text: string }[]
  role: string
  arrival: string
  objective: string
  places: { name: string; text: string }[]
  rules: { name: string; text: string }[]
  prelude: string
}

export type StoryDefinition = {
  slug: string
  version: number
  audience: StoryAudience
  title: string
  /** 표지 이미지 경로(2:3, 없으면 글자 자리표시) */
  cover?: string
  tagline: string
  intro: string
  genres: string[]
  tags: string[]
  protagonist: { gender: 'female' | 'male'; minAge: number; defaultName: string; role: string; fields: string[] }
  notice: string
  /** 비공개: 운영 규칙(제작자 진실은 넣지 않는다) */
  worldPrompt: string
  /** 비공개: 제작자 전용 진실. 모델에게 보내지 않는다 — 검수·테스트용. */
  creatorTruth: string
  /** 비공개: 사실 id → 내용. 인물/유저가 아는 사실만 프롬프트에 들어간다. */
  facts: Record<string, string>
  characters: StoryCharacter[]
  opening: string
  entry?: StoryEntry
  vars: Record<string, VarDef>
  relation: { trustMax: number; affinityMax: number; outcomes: string[]; romanceOutcome: string; romanceGate: Cond[]; outcomeVar: string }
  events: StoryEvent[]
  endings: StoryEnding[]
  contacts: ContactRule[]
  contactPolicy: { dailyCap: number; speakerGapHours: number; unreadPerSpeaker: number; quiet: { start: string; end: string }; medium: string }
  /** 검사용 QA 경로(원고의 8건) — 테스트가 읽는다. */
  qa?: string[]
}

export type RelState = { trust: number; affinity: number; contact: ContactPermission; boundaries: string[]; outcome: string | null }
export type MemoryItem = { id: string; eventId: string | null; who: string; fact: string; quote: string; source: string }

export type StoryState = {
  current: string | 'ended'
  completed: string[]
  choices: Record<string, string>
  vars: Record<string, Val | string[]>
  rel: Record<string, RelState>
  /** who('player'|인물 키) → 아는 사실 id */
  known: Record<string, string[]>
  /** 사건별 신뢰 증가 기록: `${eventId}:${char}` */
  trustLog: string[]
  affinityLog: string[]
  exclusive: string | null
  terms: string[]
  memory: MemoryItem[]
  promises: MemoryItem[]
  notes: string[]
  /** 이야기 장면 진행 수 — 완료·합의된 시간 이동마다 +1. 현실 시간과 무관. */
  scene: number
  contactOptIn: boolean
  premise: 'accepted' | 'refused'
  ending: string | null
}

/** 해석기가 제안할 수 있는 행동. 값은 제안일 뿐 서버가 검증한다. quote 는 유저 입력에 그대로 있어야 한다. */
export type StoryAction =
  | { type: 'option'; option: string; pick?: string | null; quote: string }
  | { type: 'trust'; character: string; quote: string }
  | { type: 'affinity'; character: string; quote: string }
  | { type: 'contact'; character: string; value: 'allowed' | 'stopped'; quote: string }
  | { type: 'boundary'; character: string; value: string; quote: string }
  | { type: 'relation_outcome'; character: string; value: string; quote: string }
  | { type: 'exclusive'; character: string | null; quote: string }
  | { type: 'memory'; character: string | null; value: string; quote: string }
  | { type: 'promise'; character: string; value: string; quote: string }
  | { type: 'refuse_premise'; quote: string }
  | { type: 'accept_premise'; quote: string }
  | { type: 'time_skip'; quote: string }

export type AppliedChange = { kind: string; detail: Record<string, unknown> }
export type Rejected = { action: StoryAction; reason: string }
