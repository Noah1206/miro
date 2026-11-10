/** 공식 캐릭터 시드 데이터의 모양(남성향 male-characters*.data.mts 가 씀). seed-bl-characters.mts 가 운영에 넣는다. */
import type { Routine } from '@miro/domain'

export type Dialogue = { role: 'character' | 'user' | 'narrator'; text: string; purpose?: 'intro'; scene?: string; context?: string; time?: string; location?: string; image?: string }
export type Seed = {
  slug: string
  /** 일반 수위 전용(고등학생). 언베일은 직업의 '고등학생' 단어로 자동 차단된다. */
  general?: true
  /** 기본 'female'(여성향). 남성향 캐릭터만 'male'. */
  audience?: 'male'
  /** 운영자 계정 비공개로 넣는다(기본 공개). */
  private?: true
  name: string
  age: string
  /** 기본 '한국'. 판타지 세계면 그 세계의 소속으로. */
  nationality?: string
  occupation: string
  mbti: string
  tagline: string
  /** 공개 소개 — 상세 화면에 보인다. 유저가 대화 전에 알아도 되는 것만. */
  personality: string
  /** 비공개 설정 — 프롬프트·성격표에만. 속마음·숨긴 사정·행동 규칙·약점. */
  secret: string
  values: string
  speechStyle: string
  userNickname: string
  /** 페르소나 작성 안내(11/4) — 첫 대화 전 세계관 카드의 '이 세계에서의 나' 칸 안내. */
  personaGuide?: string
  /** 11/10 상태창 형식(크랙 INFO 블록) — 매 답변 끝에 채워 붙인다 */
  statusFormat?: string
  /** 11/10 플레이 가이드(사용자에게만) */
  playGuide?: string
  /** 11/10 추천 첫 답변 최대 3개 */
  firstReplies?: string[]
  /** 11/10 엔딩 */
  endings?: Array<{ name: string; grade: 'N' | 'R' | 'SR' | 'SSR'; minTurns: number; condition: string; epilogue?: string; hint?: string }>
  /** 11/10 스탯 최대 7개 */
  stats?: Array<{ name: string; min: number; max: number; default: number; unit?: string; description: string }>
  /** 언베일 썸네일(11/4) — 대표·갤러리 사진 노출이 커서 언베일을 안 켠 사람에겐 흐리게. */
  coverUnveil?: true
  /** 카드 목소리(official_voices.id, 11/4). 없으면 운영 DB 의 값을 건드리지 않는다. */
  voice?: string
  /** 여러 인물 카드의 히로인별 목소리 { 히로인 이름: official_voices.id } — 같은 목소리 공유 가능(11/4). */
  ensembleVoices?: Record<string, string>
  hobbies: string[]
  dislikes: string[]
  jealousy: number
  initiative: number
  emotionalExpression: number
  relationshipKeywords: string[]
  startingContext: string
  startingTime: string
  sampleDialogue: Dialogue[]
  lore: Array<{ keywords: string[]; content: string }>
  initialRelationship: Record<string, number | string>
  world: { era?: string; location: string; genre: string; worldSetting: string }
  contact: {
    contactFrequency: number; initiativeLevel: number; replyDelayMinutes: number
    callProbability: number; photoProbability: number; voiceMessageProbability: number
    activeHoursStart: string; activeHoursEnd: string
    routine: Omit<Routine, 'version' | 'source' | 'generatedAt'>
  }
  visual: {
    baseFace: { eyes: string; nose: string; jaw: string; skin: string; distinctive: string }
    hair: { color: string; length: string; style: string }
    bodyProfile: { build: 'slim' | 'average' | 'athletic' | 'muscular'; gender: 'male' | 'female'; height: string; detail: string }
    styleTags: string[]
    expressionTendency: string
  }
}
