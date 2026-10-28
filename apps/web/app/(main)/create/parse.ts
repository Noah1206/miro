import { parseIntroDialogue } from '@/lib/intro-dialogue'
import { normalizeSituationImages } from '@/lib/situation-images'
import { CHARACTER_MEDIA, type CharacterMedia } from '@miro/config'
import { BONDING_CURVES, BUILD_TYPES, GENDER_TYPES, normalizeLore, parseRelationshipProfile } from '@miro/domain'
import type { CharacterCommand } from '@miro/db'
import { searchNeedle } from '@/lib/search-params'
export { MOODS } from '@/lib/genres'
import { RELATIONS } from '@/lib/genres'

/** 등록 전 테스트 채팅의 턴 수 — 한 초안에서 사용자가 보낼 수 있는 메시지 수(assist.ts·test-chat.tsx). */
export const TEST_CHAT_LIMIT = 10
/** 명령어 한도(10/19) — 캐릭터당 개수, 이름·설명·지시 글자 수. 라이브러리(commands.ts)도 같은 값을 쓴다. */
export const COMMAND_LIMITS = { count: 20, name: 12, hint: 40, prompt: 400 } as const
/** 명령어 목록 JSON 을 한도 안으로 읽는다. 모양이 이상하면 빈 목록. */
export function parseCommands(raw: string): CharacterCommand[] {
  let items: unknown
  try { items = JSON.parse(raw || '[]') } catch { return [] }
  if (!Array.isArray(items)) return []
  const seen = new Set<string>()
  return items.flatMap((item): CharacterCommand[] => {
    if (!item || typeof item !== 'object') return []
    const { name, hint, prompt, sourceId } = item as Record<string, unknown>
    if (typeof name !== 'string' || typeof prompt !== 'string') return []
    const cleanName = name.trim().replace(/^\//, '').replace(/\s+/g, '').slice(0, COMMAND_LIMITS.name)
    const cleanPrompt = prompt.trim().slice(0, COMMAND_LIMITS.prompt)
    if (!cleanName || !cleanPrompt || seen.has(cleanName)) return []
    seen.add(cleanName)
    return [{ name: cleanName, hint: typeof hint === 'string' ? hint.trim().slice(0, COMMAND_LIMITS.hint) : '', prompt: cleanPrompt,
      ...(typeof sourceId === 'string' && /^[0-9a-f-]{36}$/i.test(sourceId) ? { sourceId } : {}) }]
  }).slice(0, COMMAND_LIMITS.count)
}
export const STAGES = ['stranger', 'acquaintance', 'professional', 'friend', 'ambiguous', 'flirting', 'rivalry', 'distrust', 'conflict', 'dating', 'lover'] as const
export const CHANNELS = ['message', 'photo', 'voice_message', 'voice_call'] as const
export type ParsedCharacter = ReturnType<typeof parseCharacterForm>

/**
 * 만들기·편집이 같은 폼을 쓰므로 읽는 법도 하나다.
 * 비워 둔 칸은 스키마 기본값이 메운다 — 빈칸 때문에 저장이 막히면 안 된다.
 */
export function parseCharacterForm(form: FormData, expectedType?: 'chat' | 'reality') {
  const s = (k: string): string => String(form.get(k) ?? '').trim()
  const orNull = (v: string): string | null => (v.length > 0 ? v : null)
  const clamp = (k: string, fallback: number): number => {
    if (!s(k)) return fallback
    const n = Number(s(k)); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback
  }
  const tags = (k: string, max: number, len: number): string[] =>
    s(k).split(',').map((t) => t.trim().slice(0, len)).filter(Boolean).slice(0, max)
  const oneOf = <T extends string>(k: string, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(s(k)) ? (s(k) as T) : fallback

  const publish = s('intent') !== 'draft'
  const rawType = s('experienceType')
  if (rawType !== 'chat' && rawType !== 'reality') throw new Error('INVALID_CHARACTER_TYPE')
  const experienceType: 'chat' | 'reality' = rawType
  if (expectedType && experienceType !== expectedType) throw new Error('CHARACTER_TYPE_IMMUTABLE')
  if (experienceType === 'chat' && [
    'contactEnabled', 'contactToggle', 'contactChanged', 'contactFrequency', 'initiativeLevel',
    'replyDelayMinutes', 'preferredChannel', 'callProbability', 'videoCallProbability',
    'photoProbability', 'voiceMessageProbability', 'activeHoursStart', 'activeHoursEnd', 'senderLabel',
    'stage', 'trust', 'attraction', 'relJealousy', 'protectiveness', 'emotionalDistance',
    'attachment', 'bonding', 'jealousy', 'initiative', 'emotionalExpression', 'agencyExplicitField',
    'relationshipProfile', 'relationshipProfileChanged',
  ].some(key => form.has(key))) throw new Error('CHARACTER_TYPE_SETTINGS_INVALID')

  const name = s('name')
  if (!name) throw new Error('NAME_REQUIRED')
  if (name.length > 10 || s('title').length > 40 || s('personality').length > 1000 || s('startingContext').length > 600) throw new Error('CHARACTER_FIELD_TOO_LONG')
  if (publish && !s('title')) throw new Error('TITLE_REQUIRED')
  if (publish && !s('startingContext')) throw new Error('STARTING_CONTEXT_REQUIRED')
  const personality = s('personality') || (publish ? '' : `${name}에 대한 설명은 아직 적히지 않았다.`)
  if (publish && !personality) throw new Error('PERSONALITY_REQUIRED')

  // 나이는 숫자로 제한하지 않는다 — "추정불가", "1000살" 처럼 캐릭터마다 다를 수 있다.
  const age = orNull(s('age').slice(0, 20))

  const build = oneOf('build', BUILD_TYPES, 'average')
  const gender = oneOf('gender', GENDER_TYPES, 'male')

  // 상황 예시 — DialogueEditor 가 JSON 으로 싣는다. 모양이 이상하면 버린다.
  let sampleDialogue: Array<{ role: 'character' | 'user' | 'narrator'; text: string }> = []
  try {
    const raw = JSON.parse(s('sampleDialogue') || '[]') as unknown
    if (Array.isArray(raw)) {
      sampleDialogue = raw
        .filter((t): t is { role: string; text: string } => typeof t === 'object' && t !== null && typeof (t as { text?: unknown }).text === 'string')
        .filter((t) => t.role === 'character' || t.role === 'user' || t.role === 'narrator')
        .map((t) => ({ role: t.role as 'character' | 'user' | 'narrator', text: t.text.trim().slice(0, 500) }))
        .filter((t) => t.text).slice(0, 20)
    }
  } catch { /* 빈 배열 */ }

  // 로어북 — LoreEditor 가 JSON 으로 싣는다. 모양이 이상하면 버린다(상황 예시와 같은 규칙).
  let lore: ReturnType<typeof normalizeLore> = []
  try { lore = normalizeLore(JSON.parse(s('lore') || '[]')) } catch { /* 빈 배열 */ }

  // 분류·설정 탭(10/28) — 카테고리 하나 + 해시태그(최대 10). 해시태그 중 관계 태그 목록에 있는 것은 관계 태그 칸으로,
  // 나머지(장르·직접 입력)는 카테고리 뒤에 붙여 장르 칸으로 — 홈 장르·관계 필터와 카드 해시태그가 예전 칸을 그대로 읽는다.
  const hashtags = tags('hashtags', 10, 20)
  const relationSet = new Set<string>(RELATIONS)
  const relationshipKeywords = hashtags.filter(h => relationSet.has(h))
  const moodSource = [s('category').slice(0, 20), ...hashtags.filter(h => !relationSet.has(h))].filter(Boolean).join(',')

  let situationImages: ReturnType<typeof normalizeSituationImages> = []
  try { situationImages = normalizeSituationImages(JSON.parse(s('situationImages') || '[]')) } catch { /* 빈 배열 */ }

  const startingTime = orNull(s('startingTime'))
  const initialRelationship = {
    stage: oneOf('stage', STAGES, 'stranger'),
    trust: clamp('trust', 30),
    attraction: clamp('attraction', 10),
    jealousy: clamp('relJealousy', 0),
    protectiveness: clamp('protectiveness', 20),
    emotionalDistance: clamp('emotionalDistance', 60),
    attachment: clamp('attachment', 10),
    // 작성자가 고른 친해지는 곡선만 남긴다. '자동'이면 비워 두고 실행할 때 성향값으로 정한다.
    ...((BONDING_CURVES as readonly string[]).includes(s('bonding')) ? { bonding: s('bonding') } : {}),
  }

  // 관계 성격표 — 작성자가 편집기에서 고쳤을 때만 싣는다. 안 고쳤으면 저장된 표(뒤에서 AI 가 만든 것일 수 있다)를 건드리지 않는다.
  // 값은 선택지 안으로만 들어온다(parseRelationshipProfile). 모양이 틀리면 고치지 않은 것으로 본다.
  let relationshipProfile: ReturnType<typeof parseRelationshipProfile> = null
  if (form.get('relationshipProfileChanged') === 'on') {
    try { relationshipProfile = parseRelationshipProfile(JSON.parse(s('relationshipProfile') || 'null')) } catch { /* 고치지 않은 것으로 본다 */ }
  }

  const character = {
    name,
    tagline: orNull(s('title')),
    age,
    nationality: orNull(s('nationality')),
    occupation: orNull(s('occupation')),
    mbti: orNull(s('mbti').toUpperCase().slice(0, 4)),
    personality,
    hobbies: tags('hobbies', 6, 30),
    dislikes: tags('dislikes', 6, 30),
    jealousy: clamp('jealousy', 50),
    initiative: clamp('initiative', 50),
    emotionalExpression: clamp('emotionalExpression', 50),
    relationshipKeywords,
    startingContext: orNull(s('startingContext')),
    ...(startingTime ? { startingTime } : {}),
    sampleDialogue: [...sampleDialogue, ...parseIntroDialogue(s('introDialogue') || '[]')],
    lore,
    situationImages,
    // 권장 대화 설정(10/28) — 모델을 비우면 저장하지 않는다(서버 기본).
    // 생각(10/28) — 낮음은 지금 기본과 같아서 싣지 않는다. 모델을 비워도 생각만 고를 수 있다.
    recommendedChat: s('recommendedModel') || ['medium', 'high'].includes(s('recommendedThinking')) ? {
      model: s('recommendedModel').slice(0, 120), length: (s('recommendedLength') === 'long' ? 'long' : 'scene') as 'scene' | 'long',
      ...(['medium', 'high'].includes(s('recommendedThinking')) ? { thinking: s('recommendedThinking') as 'medium' | 'high' } : {}),
    } : null,
    commands: parseCommands(s('commands')),
    // 홈 남성향/여성향(10/20). 기본 여성향.
    audience: (s('audience') === 'male' ? 'male' : 'female') as 'male' | 'female',
    initialRelationship,
    ...(relationshipProfile ? { relationshipProfile } : {}),
  }

  const moodByNeedle = new Map<string, string>()
  for (const value of moodSource.split(/[,·]/).map(value => value.trim().slice(0, 20)).filter(Boolean)) {
    const needle = searchNeedle(value)
    if (!moodByNeedle.has(needle)) moodByNeedle.set(needle, value)
    if (moodByNeedle.size === 11) break
  }
  const mood = [...moodByNeedle.values()]
  const world = { era: null, location: orNull(s('worldLocation').slice(0, 60)), genre: mood.length > 0 ? mood.join(' · ') : null, worldSetting: orNull(s('worldSetting')) }

  // 연락 성향. 스위치가 꺼지면 enabled=false — 엔진이 어떤 이유로도 먼저 연락하지 않는다.
  const delayN = Number(s('replyDelayMinutes'))
  // 캐릭터 유형(10/19): 대화만 / 몰입 모드(음성) / 몰입 모드(음성+영상). 통화 확률과는 무관하다(전화가 아니다).
  const media: CharacterMedia = oneOf('media', CHARACTER_MEDIA, 'text')
  const contact = {
    enabled: experienceType === 'reality' && form.get('contactEnabled') === 'on',
    contactFrequency: clamp('contactFrequency', 50),
    initiativeLevel: clamp('initiativeLevel', 50),
    replyDelayMinutes: Number.isInteger(delayN) && delayN >= 0 && delayN <= 1440 ? delayN : 5,
    preferredChannel: oneOf('preferredChannel', CHANNELS, 'message'),
    callProbability: clamp('callProbability', 30),
    videoCallProbability: clamp('videoCallProbability', 10),
    photoProbability: clamp('photoProbability', 20),
    voiceMessageProbability: clamp('voiceMessageProbability', 20),
    activeHoursStart: /^\d{2}:\d{2}$/.test(s('activeHoursStart')) ? s('activeHoursStart') : '08:00',
    activeHoursEnd: /^\d{2}:\d{2}$/.test(s('activeHoursEnd')) ? s('activeHoursEnd') : '23:00',
    presentation: { ...(orNull(s('senderLabel')) ? { senderLabel: s('senderLabel').slice(0, 30) } : {}), media },
  }

  // 외형. 사진이 이 값으로 같은 사람을 그린다.
  const face = (k: 'eyes' | 'nose' | 'jaw' | 'skin' | 'distinctive') => orNull(s(k))
  const visual = {
    baseFace: { eyes: face('eyes'), nose: face('nose'), jaw: face('jaw'), skin: face('skin'), distinctive: face('distinctive') },
    hair: { color: orNull(s('hairColor')), length: orNull(s('hairLength')), style: orNull(s('hairStyle')) },
    bodyProfile: { build, gender, height: orNull(s('height')), detail: orNull(s('detail')) },
    styleTags: tags('styleTags', 5, 40),
    expressionTendency: orNull(s('expression')),
  }

  return {
    experienceType,
    publish,
    // Only deliberate choices carry numeric authorship; hidden default values alone do not.
    agencyExplicitFields: [...new Set(form.getAll('agencyExplicitField').filter((field): field is string =>
      typeof field === 'string' && ['personality.jealousy', 'personality.initiative', 'personality.emotionalExpression'].includes(field)))],
    isPublicOn: form.get('isPublic') === 'on',
    // 공식 목소리 ID. 지금 고를 수 있는 것인지는 저장할 때 서버가 DB 로 다시 본다(lib/voice.ts).
    voiceId: orNull(s('voiceId').slice(0, 40)),
    startingTime,
    character, world, contact, visual, initialRelationship,
  }
}
