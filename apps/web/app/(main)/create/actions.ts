'use server'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import {
  db, characters, worlds, contactProfiles, roleplaySessions, worldStates, relationships, characterVisualIdentities } from '@miro/db'
import { CharacterDraft, generateCharacterDraft, resolveLLM } from '@miro/providers'
import { BUILD_TYPES, GENDER_TYPES, type BuildType, type GenderType } from '@miro/domain'
import { requireUser } from '@/lib/auth'
import { UsageExceededError, exceededMessage, guarded } from '@/lib/usage/guard'
import { track } from '@/lib/analytics/track'

export type DraftState = {
  draft: CharacterDraft | null
  error: string | null
  providerNotice: string | null
}

/** 빠른 만들기 — 한 문장 → 편집 가능한 Draft. 확정값이 아니다. */
export async function createDraft(_prev: DraftState, form: FormData): Promise<DraftState> {
  const user = await requireUser()

  const oneLiner = String(form.get('oneLiner') ?? '').trim()
  if (oneLiner.length < 4) {
    return { draft: null, error: '조금 더 자세히 적어 주세요.', providerNotice: null }
  }
  if (oneLiner.length > 300) {
    return { draft: null, error: '300자 이내로 적어 주세요.', providerNotice: null }
  }

  const llm = resolveLLM()
  try {
    const draft = await guarded(
      { userId: user.id, kind: 'characterDraft', idempotencyKey: `draft:${user.id}:${crypto.randomUUID()}` },
      () => generateCharacterDraft(llm, oneLiner),
    )
    return { draft, error: null, providerNotice: llm.info.notice }
  } catch (e) {
    if (e instanceof UsageExceededError) {
      return { draft: null, error: exceededMessage(e), providerNotice: llm.info.notice }
    }
    return {
      draft: null,
      error: '캐릭터 초안을 만들지 못했습니다. 다시 시도해 주세요.',
      providerNotice: llm.info.notice,
    }
  }
}

/**
 * 저장. 두 갈래가 여기서 만난다: AI 초안을 고친 경우(draft 있음)와 빈 폼에 직접 쓴 경우.
 * 화면에서 쓴 값이 초안보다 우선하고, 비워 둔 칸은 초안 → 스키마 기본값 순으로 메운다.
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

  const rawDraft = String(form.get('draft') ?? '')
  const parsed = rawDraft ? CharacterDraft.safeParse(JSON.parse(rawDraft)) : null
  const d = parsed?.success ? parsed.data : null
  const publish = s('intent') !== 'draft'

  const name = s('name') || d?.identity.name || ''
  if (!name) throw new Error('NAME_REQUIRED')
  const personality = s('personality') || d?.personality.personality || (publish ? '' : `${name}에 대한 설명은 아직 적히지 않았다.`)
  if (publish && !personality) throw new Error('PERSONALITY_REQUIRED')

  const ageN = Number(s('age'))
  const age = Number.isInteger(ageN) && ageN >= 18 && ageN <= 99 ? ageN : (d?.identity.age ?? null)

  const build = oneOf('build', BUILD_TYPES, d?.appearance.body.build ?? 'average')
  const gender = oneOf('gender', GENDER_TYPES, d?.appearance.body.gender ?? 'male')

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
    era: orNull(s('era')) ?? d?.world.era ?? null,
    location: orNull(s('location')) ?? d?.world.location ?? null,
    genre: orNull(s('genre')) ?? d?.world.genre ?? null,
    worldSetting: orNull(s('worldSetting')) ?? d?.world.worldSetting ?? null,
  }
  const startingContext = orNull(s('startingContext')) ?? d?.startingContext ?? null
  const startingTime = orNull(s('startingTime')) ?? d?.startingTime ?? null

  const stage = oneOf('stage', STAGES, (d?.initialRelationship.stage as (typeof STAGES)[number] | undefined) ?? 'stranger')
  const r = d?.initialRelationship
  const initialRelationship = {
    stage,
    trust: clamp('trust', r?.trust ?? 30),
    attraction: clamp('attraction', r?.attraction ?? 10),
    jealousy: clamp('relJealousy', r?.jealousy ?? 0),
    protectiveness: clamp('protectiveness', r?.protectiveness ?? 20),
    emotionalDistance: clamp('emotionalDistance', r?.emotionalDistance ?? 60),
    attachment: clamp('attachment', r?.attachment ?? 10),
  }

  // 연락 성향. 스위치가 꺼지면 enabled=false — 엔진이 어떤 이유로도 먼저 연락하지 않는다.
  const c = d?.contactStyle
  const delayN = Number(s('replyDelayMinutes'))
  const contact = {
    enabled: form.get('contactEnabled') === 'on',
    contactFrequency: clamp('contactFrequency', c?.contactFrequency ?? 50),
    initiativeLevel: clamp('initiativeLevel', c?.initiativeLevel ?? 50),
    replyDelayMinutes: Number.isInteger(delayN) && delayN >= 0 && delayN <= 1440 ? delayN : (c?.replyDelayMinutes ?? 5),
    preferredChannel: oneOf('preferredChannel', CHANNELS, c?.preferredChannel ?? 'message'),
    callProbability: clamp('callProbability', c?.callProbability ?? 30),
    videoCallProbability: clamp('videoCallProbability', c?.videoCallProbability ?? 10),
    photoProbability: clamp('photoProbability', c?.photoProbability ?? 20),
    voiceMessageProbability: clamp('voiceMessageProbability', c?.voiceMessageProbability ?? 20),
    activeHoursStart: /^\d{2}:\d{2}$/.test(s('activeHoursStart')) ? s('activeHoursStart') : (c?.activeHoursStart ?? '08:00'),
    activeHoursEnd: /^\d{2}:\d{2}$/.test(s('activeHoursEnd')) ? s('activeHoursEnd') : (c?.activeHoursEnd ?? '23:00'),
    presentation: orNull(s('senderLabel')) ? { senderLabel: s('senderLabel').slice(0, 30) } : {},
  }

  // 외형. 화면 값이 초안을 덮는다. 사진이 이 값으로 같은 사람을 그린다.
  const a = d?.appearance
  const face = (k: 'eyes' | 'nose' | 'jaw' | 'skin' | 'distinctive') => orNull(s(k)) ?? a?.baseFace[k] ?? null
  const visual = {
    baseFace: { eyes: face('eyes'), nose: face('nose'), jaw: face('jaw'), skin: face('skin'), distinctive: face('distinctive') },
    hair: { color: orNull(s('hairColor')) ?? a?.hair.color ?? null, length: orNull(s('hairLength')) ?? a?.hair.length ?? null, style: orNull(s('hairStyle')) ?? a?.hair.style ?? null },
    bodyProfile: { build, gender, height: orNull(s('height')) ?? a?.body.height ?? null, detail: orNull(s('detail')) ?? a?.body.detail ?? null },
    styleTags: tags('styleTags', 5, 40).length > 0 ? tags('styleTags', 5, 40) : (a?.styleTags ?? []),
    expressionTendency: orNull(s('expression')) ?? a?.expression ?? null,
    referenceSource: d ? ('ai_generated' as const) : ('text' as const),
  }

  const outputStyle = oneOf('outputStyle', ['messenger', 'balanced', 'narrative'] as const, 'balanced')

  const result = await db.transaction(async (tx) => {
    const [character] = await tx.insert(characters).values({
      ownerId: user.id, isOfficial: false, name,
      tagline: orNull(s('title')),
      age,
      nationality: orNull(s('nationality')) ?? d?.identity.nationality ?? null,
      occupation: orNull(s('occupation')) ?? d?.identity.occupation ?? null,
      mbti: orNull(s('mbti').toUpperCase().slice(0, 4)) ?? d?.identity.mbti ?? null,
      personality,
      values: orNull(s('values')) ?? d?.personality.values ?? null,
      speechStyle: orNull(s('speechStyle')) ?? d?.personality.speechStyle ?? null,
      userNickname: orNull(s('userNickname')),
      hobbies: tags('hobbies', 6, 30).length > 0 ? tags('hobbies', 6, 30) : (d?.personality.hobbies ?? []),
      dislikes: tags('dislikes', 6, 30).length > 0 ? tags('dislikes', 6, 30) : (d?.personality.dislikes ?? []),
      jealousy: clamp('jealousy', d?.personality.jealousy ?? 50),
      initiative: clamp('initiative', d?.personality.initiative ?? 50),
      emotionalExpression: clamp('emotionalExpression', d?.personality.emotionalExpression ?? 50),
      socialPosition: orNull(s('socialPosition')) ?? d?.socialPosition ?? null,
      role: orNull(s('role')) ?? d?.presentation.role ?? null,
      relationshipKeywords: tags('relationshipKeywords', 4, 20).length > 0 ? tags('relationshipKeywords', 4, 20) : (d?.presentation.relationshipKeywords ?? []),
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
