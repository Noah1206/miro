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
 * Draft 저장 후 역할극 시작.
 * 공식 캐릭터와 동일하게 characters/worlds/contact_profiles 를 채우므로
 * 이후 모든 경로(진입·RP·선연락)가 같은 코드를 탄다.
 */
export async function saveDraft(form: FormData): Promise<void> {
  const user = await requireUser()

  const parsed = CharacterDraft.safeParse(JSON.parse(String(form.get('draft') ?? '{}')))
  if (!parsed.success) throw new Error('INVALID_DRAFT')
  const d = parsed.data

  // 사용자가 편집한 이름을 우선한다.
  const editedName = String(form.get('name') ?? '').trim()
  const name = editedName.length > 0 ? editedName : d.identity.name

  // 체형은 화면에서 고른 값이 초안보다 우선한다. 값이 이상하면 초안으로 되돌린다.
  const picked = String(form.get('build') ?? '')
  const build: BuildType = (BUILD_TYPES as readonly string[]).includes(picked)
    ? (picked as BuildType)
    : d.appearance.body.build

  const sessionId = await db.transaction(async (tx) => {
    const [character] = await tx.insert(characters).values({
      ownerId: user.id,
      isOfficial: false,
      name,
      age: d.identity.age,
      nationality: d.identity.nationality,
      occupation: d.identity.occupation,
      mbti: d.identity.mbti,
      personality: d.personality.personality,
      values: d.personality.values,
      speechStyle: d.personality.speechStyle,
      hobbies: d.personality.hobbies,
      dislikes: d.personality.dislikes,
      jealousy: d.personality.jealousy,
      initiative: d.personality.initiative,
      emotionalExpression: d.personality.emotionalExpression,
      socialPosition: d.socialPosition,
      startingContext: d.startingContext,
      startingTime: d.startingTime,
      role: d.presentation.role,
      relationshipKeywords: d.presentation.relationshipKeywords,
      initialRelationship: d.initialRelationship,
      isDraft: false,
    }).returning({ id: characters.id })

    const characterId = character!.id

    const [world] = await tx.insert(worlds)
      .values({ characterId, ...d.world })
      .returning({ id: worlds.id })

    await tx.insert(contactProfiles).values({ characterId, ...d.contactStyle })

    /** 외형 — 사진·Live Scene·영상통화가 이 값으로 같은 사람을 그린다. */
    await tx.insert(characterVisualIdentities).values({
      characterId,
      baseFace: d.appearance.baseFace,
      hair: d.appearance.hair,
      bodyProfile: { ...d.appearance.body, build },
      styleTags: d.appearance.styleTags,
      expressionTendency: d.appearance.expression,
      referenceSource: 'ai_generated',
    })

    const [session] = await tx.insert(roleplaySessions).values({
      userId: user.id, characterId, worldId: world!.id,
    }).returning({ id: roleplaySessions.id })

    await tx.insert(worldStates).values({
      sessionId: session!.id,
      currentLocation: d.world.location,
      currentTime: d.startingTime,
    })
    await tx.insert(relationships).values({
      sessionId: session!.id, ...d.initialRelationship,
    })

    return session!.id
  })

  void track(user.id, 'character_created', { sessionId })
  void track(user.id, 'rp_started', { sessionId, official: false })
  redirect(`/chat/${sessionId}`)
}
