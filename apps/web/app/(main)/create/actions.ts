'use server'

import { redirect } from 'next/navigation'
import {
  db, characters, worlds, contactProfiles, roleplaySessions, worldStates, relationships, characterVisualIdentities } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { track } from '@/lib/analytics/track'
import { parseCharacterForm } from './parse'

/**
 * 저장. 읽는 법은 parse.ts — 편집과 같다.
 *
 * intent=draft 면 isDraft 로 저장만 하고 편집 화면으로 보낸다 (명세서 2.2 예외: 임시저장).
 * intent=publish 면 세션까지 만들고 역할극으로 들어간다.
 */
export async function saveCharacter(form: FormData): Promise<void> {
  const user = await requireUser()
  const p = parseCharacterForm(form)

  const result = await db.transaction(async (tx) => {
    const [character] = await tx.insert(characters).values({
      ownerId: user.id, isOfficial: false, ...p.character,
      isDraft: !p.publish,
      // 초안은 절대 공개되지 않는다. 만들기에는 공개 스위치가 없어 등록 직후엔 비공개다 — 편집에서 켠다.
      isPublic: p.publish && p.isPublicOn,
    }).returning({ id: characters.id })
    const characterId = character!.id

    const [w] = await tx.insert(worlds).values({ characterId, ...p.world }).returning({ id: worlds.id })
    await tx.insert(contactProfiles).values({ characterId, ...p.contact })
    await tx.insert(characterVisualIdentities).values({ characterId, ...p.visual, referenceSource: 'text' })

    if (!p.publish) return { characterId, sessionId: null }

    const [session] = await tx.insert(roleplaySessions).values({
      userId: user.id, characterId, worldId: w!.id, outputStyle: p.outputStyle,
    }).returning({ id: roleplaySessions.id })
    await tx.insert(worldStates).values({ sessionId: session!.id, currentLocation: '어딘가', currentTime: p.startingTime ?? '저녁' })
    await tx.insert(relationships).values({ sessionId: session!.id, ...p.initialRelationship })
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
