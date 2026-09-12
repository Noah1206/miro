/**
 * Character Core — 안정적으로 유지되는 정체성.
 * AI 가 매 턴 성격을 새로 정의하지 못하도록 Dynamic State 와 분리한다.
 */
export type CharacterCore = {
  id: string
  ownerId: string | null // null = 공식 캐릭터
  isOfficial: boolean

  identity: {
    name: string
    age: number | null
    nationality: string | null
    occupation: string | null
    mbti: string | null
  }

  personality: {
    personality: string
    values: string | null
    speechStyle: string | null
    userNickname: string | null
    hobbies: string[]
    dislikes: string[]
    /** 0-100. 같은 행동에도 캐릭터마다 다른 반응을 만드는 성향값. */
    jealousy: number
    initiative: number
    emotionalExpression: number
  }

  worldRole: {
    socialPosition: string | null
    startingContext: string | null
  }

  visualIdentityId: string | null
  contactProfileId: string | null
}

/** Character Visual Identity — Profile / AI Photo / Live Scene / Video Call 공통 기준. */
export type CharacterVisualIdentity = {
  id: string
  characterId: string
  version: number
  baseFace: Record<string, unknown>
  bodyProfile: Record<string, unknown>
  hair: Record<string, unknown>
  styleTags: string[]
  expressionTendency: string | null
  outfitProfile: Record<string, unknown>
  referenceSource: 'text' | 'ai_generated' | 'user_upload' | 'reference_image'
}

/** Contact Style — 선연락 판단의 캐릭터별 baseline. */
export type ContactProfile = {
  id: string
  characterId: string
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
