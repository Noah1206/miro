import { z } from 'zod'

const score = z.number().int().min(0).max(100)

/**
 * Quick Create 결과 스키마.
 *
 * 이것은 확정값이 아니라 편집 가능한 Draft 다 (명세서 2.2).
 * 시작 관계는 낮은 호감에서 출발해야 한다 — 캐릭터는 처음부터 반하지 않는다.
 */
export const CharacterDraft = z.object({
  identity: z.object({
    name: z.string().min(1).max(40),
    age: z.number().int().min(18).max(99).nullable(),
    nationality: z.string().max(40).nullable(),
    occupation: z.string().max(60).nullable(),
    mbti: z.string().regex(/^[EI][NS][TF][JP]$/).nullable(),
  }),

  personality: z.object({
    personality: z.string().min(10).max(600),
    values: z.string().max(300).nullable(),
    speechStyle: z.string().max(300).nullable(),
    hobbies: z.array(z.string().max(30)).max(6),
    dislikes: z.array(z.string().max(30)).max(6),
    jealousy: score,
    initiative: score,
    emotionalExpression: score,
  }),

  world: z.object({
    era: z.string().max(40),
    location: z.string().max(60),
    genre: z.string().max(60),
    worldSetting: z.string().min(10).max(600),
  }),

  /** 카드/상세 표시용 */
  presentation: z.object({
    role: z.string().max(30),
    relationshipKeywords: z.array(z.string().max(20)).min(1).max(4),
  }),

  startingContext: z.string().min(10).max(600),
  startingTime: z.string().max(20),
  socialPosition: z.string().max(80).nullable(),

  /** 시작 관계. Validator 가 상한을 다시 강제한다. */
  initialRelationship: z.object({
    trust: score,
    attraction: score,
    jealousy: score,
    protectiveness: score,
    emotionalDistance: score,
    attachment: score,
    stage: z.enum(['stranger', 'acquaintance', 'professional']),
  }),

  contactStyle: z.object({
    contactFrequency: score,
    replyDelayMinutes: z.number().int().min(0).max(1440),
    preferredChannel: z.enum(['message', 'photo', 'voice_message', 'voice_call']),
    callProbability: score,
    videoCallProbability: score,
    photoProbability: score,
    voiceMessageProbability: score,
    activeHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
    activeHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
    initiativeLevel: score,
  }),
})

export type CharacterDraft = z.infer<typeof CharacterDraft>
