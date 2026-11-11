'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db, characters, messages, roleplaySessions } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { contextFromWorld, sceneMoment, getOrGenerate } from '@/lib/simulation/media'
import { UsageExceededError, exceededMessage } from '@/lib/usage/guard'
import { adultModeGateFor, matureGateFor } from '@/lib/ops/safety'
import { unsafeRequest } from '@/lib/ai/local-image'
import { modalImageReady, styleFor, toMomentTags, warmModalImage } from '@/lib/ai/modal-image'
import { randomInt, randomUUID } from 'node:crypto'
import { auxiliaryLLM } from '@/lib/simulation/mock-llm'
import { PHOTO_COMPOSITIONS, PHOTO_PRICE, PHOTO_SCENES, photoPrice, sceneTags, type CompositionKey, type PhotoScene } from '@/lib/photo-scenes'
import { feature } from '@miro/config'
import { COPY } from '@/lib/copy'
import { msg } from '@/lib/i18n'
import { getT } from '@/lib/i18n/server'
import { observe } from '@/lib/observe'

export type MediaState = { error: string | null; notice: string | null }

/**
 * AI 사진.
 *
 * 사용자가 "사진 보내줘" 라고 입력해야만 동작하는 구조가 아니다 —
 * 캐릭터 행동이나 선연락에서도 같은 경로로 호출된다.
 * 현재 World State 를 읽으므로 Chat 에서 이동한 장소가 그대로 반영된다.
 */
export async function requestPhoto(_prev: MediaState, form: FormData): Promise<MediaState> {
  if (!feature('imageGeneration')) return { error: COPY.error.featureOff, notice: null }
  const user = await requireUser()
  const sessionId = String(form.get('sessionId') ?? '')

  const loaded = await loadSession(sessionId, user.id)
  if (!loaded || loaded.restricted) return { error: msg('대화를 찾을 수 없습니다.'), notice: null }
  // 사진은 미로 캐릭터의 것이다. 버튼을 숨기는 것과 별개로 서버가 거절한다.

  const context = await contextFromWorld(sessionId)
  if (!context) return { error: msg('현재 상태를 불러오지 못했습니다.'), notice: null }

  // 성인 표현 요청은 서버에서 다시 판정한다. 차단 시 사유와 다음 행동을 명확히 안내한다 (명세서 7.1 표시).
  if (form.get('mature') === 'on') {
    const gate = await matureGateFor(user.id, loaded.characterId)
    if (!gate.allowed) { const t = await getT(); return { error: `${t('성인 표현을 적용할 수 없습니다.')} ${t(gate.next)}`, notice: null } }
    // 성숙한 비주얼은 별도 캐릭터가 아니라 현재 장면의 연장선이다 — 같은 외형·장소, 표현만 다르다.
    context.outfit = 'mature'
  }

  // 언베일 사진(10/19): 이 대화방에서 언베일이 켜져 있고 서버 판정(성인 인증·19세 이상 캐릭터·페르소나)을 다시 통과할 때만 자체 오픈 모델로.
  const request = String(form.get('request') ?? '').trim().slice(0, 300) || undefined
  let unveil: { level: 'soft' | 'deep' | 'explicit'; characterAge: number; request?: string } | null = null
  // 11/3 한 방(인라인 미러링): 방 종류가 아니라 지금 언베일 판정(인증·동의·19+ 캐릭터·언베일 켜짐)으로 정한다. 통과 못 하면 일반 사진.
  const [c] = await db.select({ age: characters.age, photoScenes: characters.photoScenes }).from(characters).where(eq(characters.id, loaded.characterId)).limit(1)
  const gate = await adultModeGateFor(user.id, loaded.characterId, sessionId)
  const age = Number.parseInt(String(c?.age ?? ''), 10)
  if (gate.allowed && Number.isFinite(age) && age >= 19) unveil = { level: loaded.adult.level, characterAge: age, request }
  // 고정 세부사항(11/2) — 머리·옷·속옷 색처럼 사진마다 같아야 하는 것. 사용자가 적은 글이라 요청과 같은 안전 검사를 거친다.
  const details = String(form.get('details') ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || undefined
  const unsafe = unsafeRequest(request) ?? unsafeRequest(details)
  if (unsafe === 'minor') return { error: msg('미성년자로 보이는 요청은 그릴 수 없어요.'), notice: null }
  if (unsafe === 'real_person') return { error: msg('실존 인물이나 실제 사진을 바탕으로 한 요청은 그릴 수 없어요.'), notice: null }

  // 장수·장면·구도(11/3) — 장마다 장면(scene_0…)과 구도(distance_0…)가 따로. 장면은 목록에 있는 것만, 언베일 장면은 언베일 판정을 통과할 때만.
  // 여러 장은 Modal 경로에서만(1~6장). 예전 폼의 scene·distance 도 받는다.
  const count = modalImageReady() ? Math.min(PHOTO_PRICE.max, Math.max(1, Number.parseInt(String(form.get('count') ?? '1'), 10) || 1)) : 1
  // 만든 사람이 정한 장면(id c0·c1…) — 설명을 그림 태그로 바꾼다. 언베일 장면 설명은 언베일 모델이 바꾼다(원문이 상용 공급자로 가지 않게). 같은 장면은 한 번만 바꾼다.
  const ownTags = new Map<string, Promise<string>>()
  const resolveScene = async (sceneId: string): Promise<PhotoScene | null> => {
    const customIndex = /^c(\d+)$/.exec(sceneId)?.[1]
    if (customIndex === undefined) return PHOTO_SCENES.find(s => s.id === sceneId) ?? null
    const own = (c?.photoScenes ?? [])[Number(customIndex)]
    if (!own || unsafeRequest(own.description)) return null
    if (!ownTags.has(sceneId)) ownTags.set(sceneId, toMomentTags(own.description, own.unveil ? auxiliaryLLM(loaded.characterName, { userId: user.id, sessionId, requestId: randomUUID(), workload: 'background', origin: 'photo:scene', adult: true }) : undefined))
    return { id: sceneId, label: own.label, unveil: !!own.unveil, couple: !!own.couple, tags: await ownTags.get(sceneId)! }
  }
  const plans = await Promise.all(Array.from({ length: count }, async (_, i) => {
    const sceneId = String(form.get(`scene_${i}`) ?? form.get('scene') ?? '')
    const scene = sceneId ? await resolveScene(sceneId) : null
    const picks = Object.fromEntries((Object.keys(PHOTO_COMPOSITIONS) as CompositionKey[]).map(k => [k, Number(form.get(`${k}_${i}`) ?? form.get(k) ?? 0) || 0]))
    return { sceneId, scene, picks }
  }))
  if (plans.some(p => p.sceneId && !p.scene)) return { error: msg('이 장면은 그릴 수 없어요.'), notice: null }
  if (plans.some(p => p.scene?.unveil) && !unveil) return { error: msg('언베일 장면은 언베일을 켠 대화방에서만 만들 수 있어요.'), notice: null }
  // '지금 대화 그대로'(장면을 안 고른 장) — 그 순간의 자세·표정·옷·장소를 사진에 싣는다(11/3 사용자 고정 요구).
  const moment = plans.some(p => !p.scene) ? await sceneMoment(sessionId, { explicit: !!unveil }).catch(() => '') || undefined : undefined
  // 누를 때마다 새 그림(11/2 사용자: 같은 사진을 무료로 계속 주면 안 된다) — 번호를 매번 새로 뽑아 캐시에 걸리지 않게 하고, 장마다 차감한다.
  const units = photoPrice(count) / count
  const shots = plans.map(({ scene, picks }) => ({ seed: randomInt(1, 2_147_483_647), couple: !!scene?.couple,
    tags: scene ? sceneTags(scene, picks) : '', composition: scene ? '' : sceneTags(null, picks) }))

  try {
    const results = await Promise.allSettled(shots.map(({ seed, tags, composition, couple }) => getOrGenerate({
      sessionId,
      characterId: loaded.characterId,
      characterName: loaded.characterName,
      kind: 'photo',
      context,
      usage: { userId: user.id, units },
      unveil,
      details,
      scene: tags ? { tags, couple } : undefined,
      moment,
      composition,
      seed,
    })))
    const done = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])
    if (!done.length) throw (results[0] as PromiseRejectedResult).reason

    await db.insert(messages).values(done.map(media => ({
      sessionId,
      role: 'character' as const,
      kind: 'photo' as const,
      content: media.url,
      turnIndex: loaded.snapshot.turnCount,
      mediaId: media.id,
    })))

    await db.update(roleplaySessions).set({ lastInteractionAt: new Date() })
      .where(eq(roleplaySessions.id, sessionId))

    revalidatePath(`/chat/${sessionId}`)
    const first = done[0]!
    if (done.length < shots.length) return { error: null, notice: msg('일부 사진만 도착했어요. 못 만든 사진은 차감하지 않았어요.') }
    return { error: null, notice: first.providerNotice ?? msg(done.every(m => m.cached) ? '기존 이미지를 보여드렸어요. 추가 차감은 없어요.' : '이미지가 도착했어요.') }
  } catch (e) {
    if (e instanceof UsageExceededError) return { error: exceededMessage(e), notice: null }
    observe('photo.failed', { sessionId, error: e instanceof Error ? e.message.slice(0, 160) : 'unknown' })   // 11/8 원인이 로그에 남게
    // 이미지 생성 실패 시 텍스트 역할극은 그대로 유지한다 (명세서 5.3 예외).
    return { error: msg('사진을 만들지 못했습니다. 대화는 계속할 수 있습니다.'), notice: null }
  }
}

/** 방에 들어와 사진 버튼이 보일 때, 그리고 사진 창을 열 때 — 이 방 캐릭터의 그림체 서버를 미리 깨운다(만들기를 누를 때쯤 켜져 있게). */
export async function warmPhoto(sessionId: string): Promise<void> {
  const user = await requireUser()
  const loaded = await loadSession(sessionId, user.id)
  if (!loaded) return
  const [c] = await db.select({ audience: characters.audience, slug: characters.slug }).from(characters).where(eq(characters.id, loaded.characterId)).limit(1)
  if (c) await warmModalImage(styleFor(c.audience, c.slug))
}
