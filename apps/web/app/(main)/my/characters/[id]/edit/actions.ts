'use server'

import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db, characters, worlds, contactProfiles, roleplaySessions, worldStates, relationships, characterVisualIdentities } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { getOwnedCharacter } from '@/lib/owned'
import { track } from '@/lib/analytics/track'
import { resolveCharacterImages } from '@/lib/storage/images'
import { parseCharacterForm } from '@/app/(main)/create/parse'

/**
 * 편집 저장. 만들기와 같은 폼, 같은 읽는 법(parse.ts).
 * - 임시저장 상태에서 등록하면 그때 세션을 만들고 역할극으로 들어간다.
 * - 이미 등록한 캐릭터는 저장 후 소개 페이지로 돌아간다.
 * - 외형이 바뀌면 version 을 올려 이전 외형으로 만든 이미지를 재사용하지 않는다.
 */
export async function updateCharacter(characterId: string, form: FormData): Promise<void> {
  const user = await requireUser()
  const owned = await getOwnedCharacter(characterId, user.id)
  if (!owned) notFound()

  const p = parseCharacterForm(form)
  const wasDraft = owned.character.isDraft
  const stillDraft = wasDraft && !p.publish
  const publishNow = wasDraft && p.publish

  // 사진 — 만들기(actions.ts)와 같은 규칙.
  const images = await resolveCharacterImages(form, user.id)

  const sessionId = await db.transaction(async (tx) => {
    await tx.update(characters).set({
      ...p.character, images,
      isDraft: stillDraft,
      // 초안은 절대 공개되지 않는다.
      isPublic: !stillDraft && p.isPublicOn,
    }).where(eq(characters.id, characterId))

    let worldId = owned.world?.id
    if (worldId) await tx.update(worlds).set(p.world).where(eq(worlds.id, worldId))
    else worldId = (await tx.insert(worlds).values({ characterId, ...p.world }).returning({ id: worlds.id }))[0]!.id

    if (owned.contact) await tx.update(contactProfiles).set(p.contact).where(eq(contactProfiles.characterId, characterId))
    else await tx.insert(contactProfiles).values({ characterId, ...p.contact })

    const v = owned.visual
    if (v) {
      const changed = JSON.stringify({ baseFace: v.baseFace, hair: v.hair, bodyProfile: v.bodyProfile, styleTags: v.styleTags, expressionTendency: v.expressionTendency })
        !== JSON.stringify(p.visual)
      await tx.update(characterVisualIdentities).set({ ...p.visual, version: changed ? v.version + 1 : v.version }).where(eq(characterVisualIdentities.id, v.id))
    } else {
      await tx.insert(characterVisualIdentities).values({ characterId, ...p.visual, referenceSource: 'text' })
    }

    if (!publishNow) return null
    const [session] = await tx.insert(roleplaySessions).values({
      userId: user.id, characterId, worldId, outputStyle: p.outputStyle,
    }).returning({ id: roleplaySessions.id })
    await tx.insert(worldStates).values({ sessionId: session!.id, currentLocation: '어딘가', currentTime: p.startingTime ?? '저녁' })
    await tx.insert(relationships).values({ sessionId: session!.id, ...p.initialRelationship })
    return session!.id
  })

  revalidatePath(`/character/${characterId}`)
  revalidatePath('/my')
  if (sessionId) {
    void track(user.id, 'character_created', { sessionId })
    void track(user.id, 'rp_started', { sessionId, official: false })
    redirect(`/chat/${sessionId}`)
  }
  redirect(stillDraft ? '/my?filter=draft' : `/character/${characterId}`)
}
