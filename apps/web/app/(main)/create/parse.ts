import { parseIntroDialogue } from '@/lib/intro-dialogue'
import { BONDING_CURVES, BUILD_TYPES, GENDER_TYPES, normalizeLore, parseRelationshipProfile } from '@miro/domain'
import { searchNeedle } from '@/lib/search-params'
export { MOODS } from '@/lib/genres'

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
    relationshipKeywords: tags('relationshipKeywords', 4, 20),
    startingContext: orNull(s('startingContext')),
    ...(startingTime ? { startingTime } : {}),
    sampleDialogue: [...sampleDialogue, ...parseIntroDialogue(s('introDialogue') || '[]')],
    lore,
    initialRelationship,
    ...(relationshipProfile ? { relationshipProfile } : {}),
  }

  const moodByNeedle = new Map<string, string>()
  for (const value of s('mood').split(/[,·]/).map(value => value.trim().slice(0, 20)).filter(Boolean)) {
    const needle = searchNeedle(value)
    if (!moodByNeedle.has(needle)) moodByNeedle.set(needle, value)
    if (moodByNeedle.size === 5) break
  }
  const mood = [...moodByNeedle.values()]
  const world = { era: null, location: orNull(s('worldLocation').slice(0, 60)), genre: mood.length > 0 ? mood.join(' · ') : null, worldSetting: orNull(s('worldSetting')) }

  // 연락 성향. 스위치가 꺼지면 enabled=false — 엔진이 어떤 이유로도 먼저 연락하지 않는다.
  const delayN = Number(s('replyDelayMinutes'))
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
    presentation: orNull(s('senderLabel')) ? { senderLabel: s('senderLabel').slice(0, 30) } : {},
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
