'use server'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import {
  db, characters, worlds, contactProfiles, roleplaySessions, worldStates, relationships, characterVisualIdentities } from '@miro/db'
import { CharacterDraft, generateCharacterDraft, resolveLLM } from '@miro/providers'
import { BUILD_TYPES, type BuildType } from '@miro/domain'
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
 * 폼 저장 후 역할극 시작.
 *
 * 두 길이 여기서 만난다: AI 초안을 고친 경우(draft 있음)와 빈 폼에 직접 쓴 경우(draft 없음).
 * 어느 쪽이든 공식 캐릭터와 동일하게 characters/worlds/contact_profiles 를 채우므로
 * 이후 모든 경로(진입·RP·선연락)가 같은 코드를 탄다. 직접 쓴 경우 비워 둔 칸은
 * 스키마 기본값이 메운다 — 빈칸 때문에 저장이 막히면 안 된다.
 */
export async function saveCharacter(form: FormData): Promise<void> {
  const user = await requireUser()

  const s = (k: string): string => String(form.get(k) ?? '').trim()
  const orNull = (v: string): string | null => (v.length > 0 ? v : null)

  // 초안은 있을 수도, 없을 수도 있다. 깨진 초안은 없는 것으로 친다 — 사용자가 쓴 값은 살린다.
  const rawDraft = String(form.get('draft') ?? '')
  const parsed = rawDraft ? CharacterDraft.safeParse(JSON.parse(rawDraft)) : null
  const d = parsed?.success ? parsed.data : null

  // 화면에서 쓴 값이 초안보다 우선한다.
  const name = s('name') || d?.identity.name || ''
  if (!name) throw new Error('NAME_REQUIRED')
  const personality = s('personality') || d?.personality.personality || `${name}에 대한 설명은 아직 적히지 않았다.`

  const picked = s('build')
  const build: BuildType = (BUILD_TYPES as readonly string[]).includes(picked)
    ? (picked as BuildType)
    : (d?.appearance.body.build ?? 'average')

  // 상황 예시 — 한 쌍만 받는다. 비어 있으면 넣지 않는다.
  const sampleDialogue: Array<{ role: 'character' | 'user'; text: string }> = []
  const sampleCharacter = s('sampleCharacter')
  const sampleUser = s('sampleUser')
  if (sampleCharacter) sampleDialogue.push({ role: 'character', text: sampleCharacter })
  if (sampleUser) sampleDialogue.push({ role: 'user', text: sampleUser })

  const world = {
    era: orNull(s('era')) ?? d?.world.era ?? null,
    location: orNull(s('location')) ?? d?.world.location ?? null,
    genre: orNull(s('genre')) ?? d?.world.genre ?? null,
    worldSetting: orNull(s('worldSetting')) ?? d?.world.worldSetting ?? null,
  }
  const startingContext = orNull(s('startingContext')) ?? d?.startingContext ?? null
  // startingTime 은 notNull(기본 '저녁') — null 을 넣으면 기본값을 건너뛴다. 값이 있을 때만 넘긴다.
  const startingTime = orNull(s('startingTime')) ?? d?.startingTime ?? null
  // world_states 의 장소·시간도 notNull 이다. 직접 만든 캐릭터가 비워 둘 수 있으므로 여기서 메운다.
  const openingLocation = world.location ?? '어딘가'
  const openingTime = startingTime ?? '저녁'

  const sessionId = await db.transaction(async (tx) => {
    const [character] = await tx.insert(characters).values({
      ownerId: user.id,
      isOfficial: false,
      name,
      // 제목은 카드의 한 줄로 쓴다 — 레퍼런스의 '제목' 자리.
      tagline: orNull(s('title')),
      age: d?.identity.age ?? null,
      nationality: d?.identity.nationality ?? null,
      occupation: d?.identity.occupation ?? null,
      mbti: d?.identity.mbti ?? null,
      personality,
      values: d?.personality.values ?? null,
      speechStyle: orNull(s('speechStyle')) ?? d?.personality.speechStyle ?? null,
      hobbies: d?.personality.hobbies ?? [],
      dislikes: d?.personality.dislikes ?? [],
      ...(d ? {
        jealousy: d.personality.jealousy,
        initiative: d.personality.initiative,
        emotionalExpression: d.personality.emotionalExpression,
      } : {}),
      socialPosition: d?.socialPosition ?? null,
      startingContext,
      ...(startingTime ? { startingTime } : {}),
      role: d?.presentation.role ?? null,
      relationshipKeywords: d?.presentation.relationshipKeywords ?? [],
      sampleDialogue,
      ...(d ? { initialRelationship: d.initialRelationship } : {}),
      isDraft: false,
    }).returning({ id: characters.id })

    const characterId = character!.id

    const [w] = await tx.insert(worlds).values({ characterId, ...world }).returning({ id: worlds.id })

    // 연락 성향은 초안이 있을 때만 지정한다 — 없으면 스키마 기본값이 맞다.
    await tx.insert(contactProfiles).values({ characterId, ...(d ? d.contactStyle : {}) })

    /** 외형 — 사진·Live Scene·영상통화가 이 값으로 같은 사람을 그린다. */
    if (d) {
      await tx.insert(characterVisualIdentities).values({
        characterId,
        baseFace: d.appearance.baseFace,
        hair: d.appearance.hair,
        bodyProfile: { ...d.appearance.body, build },
        styleTags: d.appearance.styleTags,
        expressionTendency: d.appearance.expression,
        referenceSource: 'ai_generated',
      })
    } else {
      // 직접 만든 캐릭터도 체형만큼은 고른 값이 있다 — 사진 생성이 이 값을 읽는다.
      await tx.insert(characterVisualIdentities).values({
        characterId,
        bodyProfile: { build },
        referenceSource: 'text',
      })
    }

    const [session] = await tx.insert(roleplaySessions).values({
      userId: user.id, characterId, worldId: w!.id,
    }).returning({ id: roleplaySessions.id })

    await tx.insert(worldStates).values({
      sessionId: session!.id,
      currentLocation: openingLocation,
      currentTime: openingTime,
    })
    await tx.insert(relationships).values({
      sessionId: session!.id, ...(d ? d.initialRelationship : {}),
    })

    return session!.id
  })

  void track(user.id, 'character_created', { sessionId })
  void track(user.id, 'rp_started', { sessionId, official: false })
  redirect(`/chat/${sessionId}`)
}
