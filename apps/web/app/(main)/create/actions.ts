'use server'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import {
  db, characters, worlds, contactProfiles, roleplaySessions, worldStates, relationships, characterVisualIdentities } from '@miro/db'
import { BUILD_TYPES, GENDER_TYPES, type BuildType, type GenderType } from '@miro/domain'
import { requireUser } from '@/lib/auth'
import { track } from '@/lib/analytics/track'

/**
 * 저장. 비워 둔 칸은 스키마 기본값이 메운다 — 빈칸 때문에 저장이 막히면 안 된다.
 *
 * intent=draft 면 isDraft 로 저장만 하고 편집 화면으로 보낸다 (명세서 2.2 예외: 임시저장).
 * intent=publish 면 세션까지 만들고 역할극으로 들어간다.
 */
export async function saveCharacter(form: FormData): Promise<void> {
  const user = await requireUser()

  const s = (k: string): string => String(form.get(k) ?? '').trim()
  const orNull = (v: string): string | null => (v.length > 0 ? v : null)
  const clamp = (k: string, fallback: number): number => {
    const n = Number(s(k)); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback
  }
  const tags = (k: string, max: number, len: number): string[] =>
    s(k).split(',').map((t) => t.trim().slice(0, len)).filter(Boolean).slice(0, max)
  const oneOf = <T extends string>(k: string, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(s(k)) ? (s(k) as T) : fallback

  const publish = s('intent') !== 'draft'

  const name = s('name') || ''
  if (!name) throw new Error('NAME_REQUIRED')
  const personality = s('personality') || (publish ? '' : `${name}에 대한 설명은 아직 적히지 않았다.`)
  if (publish && !personality) throw new Error('PERSONALITY_REQUIRED')

  const ageN = Number(s('age'))
  const age = Number.isInteger(ageN) && ageN >= 18 && ageN <= 99 ? ageN : (null)

  const build = oneOf('build', BUILD_TYPES, 'average')
  const gender = oneOf('gender', GENDER_TYPES, 'male')

  // 상황 예시 — DialogueEditor 가 JSON 으로 싣는다. 모양이 이상하면 버린다.
  let sampleDialogue: Array<{ role: 'character' | 'user'; text: string }> = []
  try {
    const raw = JSON.parse(s('sampleDialogue') || '[]') as unknown
    if (Array.isArray(raw)) {
      sampleDialogue = raw
        .filter((t): t is { role: string; text: string } => typeof t === 'object' && t !== null && typeof (t as { text?: unknown }).text === 'string')
        .filter((t) => t.role === 'character' || t.role === 'user')
        .map((t) => ({ role: t.role as 'character' | 'user', text: t.text.trim().slice(0, 500) }))
        .filter((t) => t.text).slice(0, 12)
    }
  } catch { /* 빈 배열 */ }

  const world = {
    era: orNull(s('era')) ?? null,
    location: orNull(s('location')) ?? null,
    genre: orNull(s('genre')) ?? null,
    worldSetting: orNull(s('worldSetting')) ?? null,
  }
  const startingContext = orNull(s('startingContext')) ?? null
  const startingTime = orNull(s('startingTime')) ?? null

  const stage = oneOf('stage', STAGES, 'stranger')
  const initialRelationship = {
    stage,
    trust: clamp('trust', 30),
    attraction: clamp('attraction', 10),
    jealousy: clamp('relJealousy', 0),
    protectiveness: clamp('protectiveness', 20),
    emotionalDistance: clamp('emotionalDistance', 60),
    attachment: clamp('attachment', 10),
  }

  // 연락 성향. 스위치가 꺼지면 enabled=false — 엔진이 어떤 이유로도 먼저 연락하지 않는다.
  const delayN = Number(s('replyDelayMinutes'))
  const contact = {
    enabled: form.get('contactEnabled') === 'on',
    contactFrequency: clamp('contactFrequency', 50),
    initiativeLevel: clamp('initiativeLevel', 50),
    replyDelayMinutes: Number.isInteger(delayN) && delayN >= 0 && delayN <= 1440 ? delayN : (5),
    preferredChannel: oneOf('preferredChannel', CHANNELS, 'message'),
    callProbability: clamp('callProbability', 30),
    videoCallProbability: clamp('videoCallProbability', 10),
    photoProbability: clamp('photoProbability', 20),
    voiceMessageProbability: clamp('voiceMessageProbability', 20),
    activeHoursStart: /^\d{2}:\d{2}$/.test(s('activeHoursStart')) ? s('activeHoursStart') : ('08:00'),
    activeHoursEnd: /^\d{2}:\d{2}$/.test(s('activeHoursEnd')) ? s('activeHoursEnd') : ('23:00'),
    presentation: orNull(s('senderLabel')) ? { senderLabel: s('senderLabel').slice(0, 30) } : {},
  }

  // 외형. 화면 값이 초안을 덮는다. 사진이 이 값으로 같은 사람을 그린다.
  const face = (k: 'eyes' | 'nose' | 'jaw' | 'skin' | 'distinctive') => orNull(s(k)) ?? null
  const visual = {
    baseFace: { eyes: face('eyes'), nose: face('nose'), jaw: face('jaw'), skin: face('skin'), distinctive: face('distinctive') },
    hair: { color: orNull(s('hairColor')) ?? null, length: orNull(s('hairLength')) ?? null, style: orNull(s('hairStyle')) ?? null },
    bodyProfile: { build, gender, height: orNull(s('height')) ?? null, detail: orNull(s('detail')) ?? null },
    styleTags: tags('styleTags', 5, 40).length > 0 ? tags('styleTags', 5, 40) : ([]),
    expressionTendency: orNull(s('expression')) ?? null,
    referenceSource: 'text' as const,
  }

  const outputStyle = oneOf('outputStyle', ['messenger', 'balanced', 'narrative'] as const, 'balanced')

  const result = await db.transaction(async (tx) => {
    const [character] = await tx.insert(characters).values({
      ownerId: user.id, isOfficial: false, name,
      tagline: orNull(s('title')),
      age,
      nationality: orNull(s('nationality')) ?? null,
      occupation: orNull(s('occupation')) ?? null,
      mbti: orNull(s('mbti').toUpperCase().slice(0, 4)) ?? null,
      personality,
      userNickname: orNull(s('userNickname')),
      hobbies: tags('hobbies', 6, 30).length > 0 ? tags('hobbies', 6, 30) : ([]),
      dislikes: tags('dislikes', 6, 30).length > 0 ? tags('dislikes', 6, 30) : ([]),
      jealousy: clamp('jealousy', 50),
      initiative: clamp('initiative', 50),
      emotionalExpression: clamp('emotionalExpression', 50),
      socialPosition: orNull(s('socialPosition')) ?? null,
      role: orNull(s('role')) ?? null,
      relationshipKeywords: tags('relationshipKeywords', 4, 20).length > 0 ? tags('relationshipKeywords', 4, 20) : ([]),
      startingContext,
      ...(startingTime ? { startingTime } : {}),
      sampleDialogue,
      initialRelationship,
      isDraft: !publish,
      // 초안은 절대 공개되지 않는다 — 등록할 때만 스위치가 의미를 갖는다.
      isPublic: publish && form.get('isPublic') === 'on',
    }).returning({ id: characters.id })
    const characterId = character!.id

    const [w] = await tx.insert(worlds).values({ characterId, ...world }).returning({ id: worlds.id })
    await tx.insert(contactProfiles).values({ characterId, ...contact })
    await tx.insert(characterVisualIdentities).values({ characterId, ...visual })

    if (!publish) return { characterId, sessionId: null }

    const [session] = await tx.insert(roleplaySessions).values({
      userId: user.id, characterId, worldId: w!.id, outputStyle,
    }).returning({ id: roleplaySessions.id })
    await tx.insert(worldStates).values({
      sessionId: session!.id,
      currentLocation: world.location ?? '어딘가',
      currentTime: startingTime ?? '저녁',
    })
    await tx.insert(relationships).values({ sessionId: session!.id, ...initialRelationship })
    return { characterId, sessionId: session!.id }
  })

  if (!result.sessionId) {
    // 임시저장 — 이어서 고칠 수 있는 편집 화면으로.
    redirect(`/my/characters/${result.characterId}/edit`)
  }
  void track(user.id, 'character_created', { sessionId: result.sessionId })
  void track(user.id, 'rp_started', { sessionId: result.sessionId, official: false })
  redirect(`/chat/${result.sessionId}`)
}

const STAGES = ['stranger', 'acquaintance', 'professional', 'friend', 'ambiguous', 'flirting', 'rivalry', 'distrust', 'conflict', 'dating', 'lover'] as const
const CHANNELS = ['message', 'photo', 'voice_message', 'voice_call'] as const
