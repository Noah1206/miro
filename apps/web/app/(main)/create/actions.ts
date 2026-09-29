'use server'
import { defaultSessionPolicy } from '@miro/config'
import { introMessages } from '@/lib/intro-dialogue'

import { revalidatePath } from 'next/cache'
import { and, eq, asc } from 'drizzle-orm'
import {
  db, messages, characters, worlds, contactProfiles, roleplaySessions, worldStates, relationships, characterVisualIdentities } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { track } from '@/lib/analytics/track'
import { resolveCharacterImages } from '@/lib/storage/images'
import { parseCharacterForm } from './parse'
import { captureAgencyRevision, pinAgencyRevision, scheduleAgencyCompilation } from '@/lib/agency/revisions'
import { inWrittenOrder } from '@/lib/simulation/commit'
import { selectableVoice } from '@/lib/voice'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * 저장. 읽는 법은 parse.ts — 편집과 같다.
 *
 * intent=draft 면 isDraft 로 저장만 하고 편집 화면으로 보낸다 (명세서 2.2 예외: 임시저장).
 * intent=publish 면 세션까지 만들고 역할극으로 들어간다.
 *
 * 사진은 트랜잭션 밖에서 먼저 올린다 — Storage 업로드는 롤백할 수 없어서, DB 실패 시
 * 고아 파일이 남을지언정(드문 경우) 반대로 사진 없이 저장되는 쪽보다 안전하다.
 */
export async function saveCharacter(form: FormData): Promise<string> {
  const user = await requireUser()
  // 앱은 미로 캐릭터만 만든다(2026-09-29 결정). 일반 캐릭터는 기존 것만 편집으로 남는다.
  const p = parseCharacterForm(form, 'reality')
  const creationId = String(form.get('creationId') ?? '')
  if (!UUID.test(creationId)) throw new Error('INVALID_CREATION_ID')

  // A retried submission keeps its draft ID. Return the existing result before uploading files again.
  const [already] = await db.select({ ownerId: characters.ownerId, experienceType: characters.experienceType, isDraft: characters.isDraft })
    .from(characters).where(eq(characters.id, creationId)).limit(1)
  if (already) {
    if (already.ownerId !== user.id || already.experienceType !== p.experienceType) throw new Error('INVALID_CREATION_ID')
    if (already.isDraft) return `/my/characters/${creationId}/edit`
    const [session] = await db.select({ id: roleplaySessions.id }).from(roleplaySessions)
      .where(and(eq(roleplaySessions.characterId, creationId), eq(roleplaySessions.userId, user.id)))
      .orderBy(asc(roleplaySessions.createdAt)).limit(1)
    return session ? `/chat/${session.id}` : `/character/${creationId}`
  }

  const images = await resolveCharacterImages(form, user.id)
  const voiceId = await selectableVoice(p.voiceId)

  const result = await db.transaction(async (tx) => {
    const [character] = await tx.insert(characters).values({
      id: creationId, ownerId: user.id, isOfficial: false, ...p.character, images, voiceId,
      isDraft: !p.publish,
      experienceType: p.experienceType,
      // 초안은 절대 공개되지 않는다. 등록할 때만 폼에서 선택한 공개 상태를 적용한다.
      isPublic: p.publish && p.isPublicOn,
    }).onConflictDoNothing({ target: characters.id }).returning({ id: characters.id })
    if (!character) {
      const [existing] = await tx.select({ ownerId: characters.ownerId, experienceType: characters.experienceType, isDraft: characters.isDraft })
        .from(characters).where(eq(characters.id, creationId)).limit(1)
      if (!existing || existing.ownerId !== user.id || existing.experienceType !== p.experienceType) throw new Error('INVALID_CREATION_ID')
      const [session] = await tx.select({ id: roleplaySessions.id }).from(roleplaySessions)
        .where(and(eq(roleplaySessions.characterId, creationId), eq(roleplaySessions.userId, user.id)))
        .orderBy(asc(roleplaySessions.createdAt)).limit(1)
      return { characterId: creationId, sessionId: session?.id ?? null, revisionId: null, duplicate: true }
    }
    const characterId = character.id

    const [w] = await tx.insert(worlds).values({ characterId, ...p.world }).returning({ id: worlds.id })
    await tx.insert(contactProfiles).values({ characterId, ...p.contact })
    await tx.insert(characterVisualIdentities).values({ characterId, ...p.visual, referenceSource: 'text' })
    const revision = p.experienceType === 'reality'
      ? await captureAgencyRevision(tx, characterId, { explicitFields: p.agencyExplicitFields }) : null

    if (!p.publish) return { characterId, sessionId: null, revisionId: revision?.id ?? null, duplicate: false }

    const [session] = await tx.insert(roleplaySessions).values({
      userId: user.id, characterId, worldId: w!.id, policyVersion: defaultSessionPolicy(p.experienceType),
    }).returning({ id: roleplaySessions.id })
    await tx.insert(worldStates).values({ sessionId: session!.id, currentLocation: p.world.location ?? '어딘가', currentTime: p.startingTime ?? '저녁' })
    await tx.insert(relationships).values({ sessionId: session!.id, ...p.initialRelationship })
    const openingMessages = introMessages(session!.id, p.character.sampleDialogue)
    if (openingMessages.length) await tx.insert(messages).values(inWrittenOrder(openingMessages))
    if (revision) await pinAgencyRevision(tx, session!.id, revision)
    return { characterId, sessionId: session!.id, revisionId: revision?.id ?? null, duplicate: false }
  })
  if (!result.duplicate && result.revisionId) await scheduleAgencyCompilation(result.revisionId, user.id)

  revalidatePath('/home')
  revalidatePath('/home/search')
  revalidatePath('/miro')
  revalidatePath('/my')

  if (!result.sessionId) {
    // 임시저장 — 이어서 고칠 수 있는 편집 화면으로.
    return `/my/characters/${result.characterId}/edit`
  }
  if (!result.duplicate) {
    void track(user.id, 'character_created', { sessionId: result.sessionId })
    void track(user.id, 'rp_started', { sessionId: result.sessionId, official: false })
  }
  return `/chat/${result.sessionId}`
}
