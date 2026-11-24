'use server'
import { defaultSessionPolicy } from '@miro/config'
import { introMessages } from '@/lib/intro-dialogue'

import { revalidatePath } from 'next/cache'
import { and, eq, asc, desc, isNull, sql } from 'drizzle-orm'
import {
  db, messages, characters, worlds, contactProfiles, roleplaySessions, worldStates, relationships, characterVisualIdentities } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { isMinor } from '@/lib/payments/minor'
import { msg } from '@/lib/i18n'
import { track } from '@/lib/analytics/track'
import { resolveCharacterImages, uploadCharacterImage } from '@/lib/storage/images'
import { randomUUID } from 'crypto'
import { PUBLIC_BUCKET, publicMediaName, publicMediaUrl, writeMedia } from '@/lib/storage/media'
import { tagPhoto, type PhotoTagging } from '@/lib/photo-tags'
import { takeUserQuota } from '@/lib/usage/user-quota'
import { BGM_LIMITS, BGM_TYPES } from '@/lib/bgm'
import { parseCharacterForm, stripAdult } from './parse'
import { captureAgencyRevision, pinAgencyRevision, scheduleAgencyCompilation } from '@/lib/agency/revisions'
import { inWrittenOrder } from '@/lib/simulation/commit'
import { selectableEnsemble, selectableVoice } from '@/lib/voice'
import { scheduleRelationshipProfile } from '@/lib/relationship-profile'
import { scheduleVoiceCast } from '@/lib/voice-cast'
import { giveFirstWorkGift } from '@/lib/usage/creator-reward'

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
  const p = parseCharacterForm(form)
  if (await isMinor(user.id)) stripAdult(p)
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
  const voiceId = await selectableVoice(p.voiceId, user.id)
  const ensembleVoices = await selectableEnsemble(p.ensembleVoices, user.id)

  const result = await db.transaction(async (tx) => {
    const [character] = await tx.insert(characters).values({
      id: creationId, ownerId: user.id, isOfficial: false, ...p.character, images, voiceId, ensembleVoices, ensemblePhotos: p.ensemblePhotos, ensembleCast: p.ensembleCast,
      isDraft: !p.publish,
      experienceType: p.experienceType,
      // 초안은 절대 공개되지 않는다. 등록할 때만 폼에서 선택한 공개 상태를 적용한다.
      isPublic: p.publish && p.isPublicOn,
      linkShared: p.publish && p.linkSharedOn,
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
  // 관계 성격표는 저장 뒤에 성격 설명에서 만든다 — 편집기에서 확인하고 고친다(설정이 그대로면 모델을 부르지 않는다).
  if (!result.duplicate) await scheduleRelationshipProfile(result.characterId, user.id)
  if (!result.duplicate) await scheduleVoiceCast(result.characterId, user.id)   // 11/10 등장인물 목소리 칸
  if (!result.duplicate && p.publish && p.isPublicOn) await giveFirstWorkGift(user.id)   // 11/25 창작자 이벤트

  revalidatePath('/home')
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

/** 상황별 사진 한 장(10/28) — 고르자마자 올리고 URL 만 폼에 남긴다. 저장 한 번에 실으면 서버 액션 본문 한도(4MB)를 넘는다. */
export async function uploadSituationImage(form: FormData): Promise<{ url: string } | { error: string }> {
  const user = await requireUser()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: msg('사진을 고르지 못했어요.') }
  const r = await uploadCharacterImage(file, user.id)
  return r.ok ? { url: r.url } : { error: r.error }
}

/**
 * 11/23 사진 자동 태그 — 방금 올린 상황 사진을 비전 AI 가 보고 태그·옷차림·한 줄 설명을 붙인다(lib/photo-tags.ts). 본인이 올린 사진만, 회원당 분당 30장·하루 500장.
 * 올린 사진을 외부 AI(Google)로 보내는 일이라 처리방침 국외 이전 표에 항목이 들어가기 전까지는 MIRO_PHOTO_AUTOTAG=1(전체) 또는 MIRO_PHOTO_AUTOTAG_USERS(회원 id 목록)일 때만 동작한다.
 * 꺼져 있거나 실패하면 { off: true } — 화면은 조용히 넘어가고 제작자가 직접 쓴다.
 */
export async function tagSituationImage(url: string, hint = ''): Promise<PhotoTagging | { off: true }> {
  const user = await requireUser()
  // 11/24 사용자: "돈이 없어서 태그는 그만 붙이자" — 자동 태그는 꺼 둔다. 시행일(12/23)에 저절로 켜지던 것도 뺐다: 켜려면 MIRO_PHOTO_AUTOTAG=1(전체) 또는 MIRO_PHOTO_AUTOTAG_USERS 를 직접 넣는다(사진 한 장마다 비전 AI 요금이 든다).
  const enabled = process.env.MIRO_PHOTO_AUTOTAG === '1' || (process.env.MIRO_PHOTO_AUTOTAG_USERS ?? '').split(',').map(x => x.trim()).includes(user.id)
  if (!enabled || !publicMediaName(url)?.startsWith(`${user.id}/`)) return { off: true }
  if (!(await takeUserQuota(user.id, 'photo_tag', [{ ms: 60_000, max: 30 }, { ms: 86_400_000, max: 500 }]))) return { off: true }
  return await tagPhoto(url, typeof hint === 'string' ? hint : '').catch(() => null) ?? { off: true }
}

/** 11/19 상황별 BGM 파일 하나 올리기 — 사진과 같은 서버 디스크(공개 읽기). */
export async function uploadBgm(form: FormData): Promise<{ url: string } | { error: string }> {
  const user = await requireUser()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: msg('음악 파일을 고르지 못했어요.') }
  const ext = BGM_TYPES[file.type] ?? ({ mp3: 'mp3', m4a: 'm4a', aac: 'aac', ogg: 'ogg', wav: 'wav' } as Record<string, string>)[file.name.split('.').pop()?.toLowerCase() ?? '']
  if (!ext) return { error: msg('mp3·m4a·ogg·wav 파일만 올릴 수 있어요.') }
  if (file.size > BGM_LIMITS.bytes) return { error: msg('8MB 이하 음악만 올릴 수 있어요.') }
  const path = `${user.id}/${randomUUID()}.${ext}`
  try { await writeMedia(PUBLIC_BUCKET, path, new Uint8Array(await file.arrayBuffer())) } catch { return { error: msg('음악을 올리지 못했어요.') } }
  return { url: publicMediaUrl(path) }
}

/** 11/12 설정집 불러오기 — 내가 만든 다른 작품의 설정집 항목(베이비챗 '불러오기'). 본인 작품만. */
export async function myLoreSources(): Promise<Array<{ id: string; name: string; lore: Array<{ keywords: string[]; content: string; name?: string }> }>> {
  const user = await requireUser()
  const rows = await db.select({ id: characters.id, name: characters.name, lore: characters.lore }).from(characters)
    .where(and(eq(characters.ownerId, user.id), isNull(characters.deletedAt), sql`jsonb_array_length(${characters.lore}) > 0`))
    .orderBy(desc(characters.createdAt)).limit(50)
  // 시작 설정 전용 표시(scene)는 다른 작품에선 뜻이 없어 뺀다.
  return rows.map(r => ({ id: r.id, name: r.name, lore: r.lore.map(({ scene: _scene, ...e }) => e) }))
}

/** 11/21 사용자: 만들기 머리의 '불러오기' — 내 임시저장 목록(최신순). 고르면 그 작품의 편집 화면으로 간다. */
export async function myDrafts(): Promise<Array<{ id: string; name: string; createdAt: string }>> {
  const user = await requireUser()
  const rows = await db.select({ id: characters.id, name: characters.name, createdAt: characters.createdAt }).from(characters)
    .where(and(eq(characters.ownerId, user.id), eq(characters.isDraft, true), isNull(characters.deletedAt)))
    .orderBy(desc(characters.createdAt)).limit(50)
  return rows.map(r => ({ id: r.id, name: r.name, createdAt: r.createdAt.toISOString() }))
}
