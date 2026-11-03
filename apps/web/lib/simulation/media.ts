import { randomUUID } from 'node:crypto'
import { budgetedImage } from '@/lib/ai/media-budget'
import { cappedLevel, generateLocalImage, levelTags, openImageReady, unsafeRequest, type BaseModel, type UnveilLevel } from '@/lib/ai/local-image'
import { generateModalImage, modalImageReady, styleFor, toImageTags, toMomentTags } from '@/lib/ai/modal-image'
import { saveMessengerImage } from '@/lib/storage/messenger-images'
import { usageWeight } from '@miro/config'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import {
  db, characters, characterVisualIdentities, generatedMedia, roleplaySessions, worldStates,
  messages,
} from '@miro/db'
import { buildMediaKey, buildVisualPrompt, type MediaKind, type PhotoContext } from '@miro/domain'
import { resolveImage } from '@miro/providers'
import { guarded } from '@/lib/usage/guard'
import { hasAppearance, inferAppearance } from './appearance'
import { matchSceneAsset } from './scene-assets'

export type MediaResult = {
  id: string
  url: string
  /** true 면 기존 asset 재사용 — 새 생성이 아니므로 Usage 를 소비하지 않는다. */
  cached: boolean
  /** Provider 미구성 안내. 캐시 적중 여부와 무관하게 표시한다. */
  providerNotice: string | null
}

/**
 * 캐릭터의 현재 Visual Identity.
 *
 * 없으면 빈 판을 만든다. 외형이 비어 있으면 프롬프트에 얼굴 정보가 빠져
 * 매번 다른 사람이 그려지므로, 그 전에 성격·직업·세계관을 근거로 한 번 채워 둔다
 * (이미 있는 캐릭터를 위한 보정 — 새 캐릭터는 생성 시점에 채워진다).
 */
export async function activeVisualIdentity(characterId: string) {
  const rows = await db.select().from(characterVisualIdentities)
    .where(and(
      eq(characterVisualIdentities.characterId, characterId),
      eq(characterVisualIdentities.isActive, true),
    ))
    .orderBy(desc(characterVisualIdentities.version))
    .limit(1)

  const existing = rows[0]
  if (existing && hasAppearance(existing)) return existing

  // 외형이 비어 있다 — 인물 정보로 한 번 채워 고정한다. 실패하면 있는 그대로 쓴다.
  const inferred = await inferAppearance(characterId)
  const values = inferred
    ? {
        baseFace: inferred.baseFace,
        hair: inferred.hair,
        bodyProfile: inferred.body,
        styleTags: inferred.styleTags,
        expressionTendency: inferred.expression,
        referenceSource: 'ai_generated' as const,
      }
    : { referenceSource: 'text' as const }

  if (existing) {
    const [updated] = await db.update(characterVisualIdentities).set(values)
      .where(eq(characterVisualIdentities.id, existing.id)).returning()
    return updated!
  }
  const [created] = await db.insert(characterVisualIdentities)
    .values({ characterId, ...values }).returning()
  return created!
}

/**
 * 미디어 생성 (캐시 우선).
 *
 * 같은 상황 + 같은 외형이면 기존 asset 을 반환한다. 새 생성은 그 외의 경우에만 한다.
 * 모든 이미지 경로(Photo / Background / Live Scene)가 이 함수를 거치므로
 * 기능마다 다른 외형이 나오지 않는다.
 */
export async function getOrGenerate(opts: {
  sessionId: string
  characterId: string
  characterName: string
  kind: MediaKind
  context: PhotoContext
  aspect?: '1:1' | '3:4' | '16:9'
  /**
   * 사용량 차감 주체. null 이면 차감하지 않는다 — 선연락 사진처럼 정책상 무차감인 경로.
   * 캐시 적중은 어느 경우든 차감하지 않는다.
   */
  usage: { userId: string; units?: number } | null
  /**
   * 언베일 사진(10/19) — 호출자가 adultModeGateFor 를 통과한 대화방에서만 넘긴다. 자체 오픈 모델로 그리고,
   * 결과는 그 대화방 주인만 열 수 있는 비공개 버킷에만 둔다. 공급자가 없으면 요청을 거절한다.
   */
  unveil?: { level: UnveilLevel; characterAge: number; request?: string } | null
  /** 사용자가 고정해 둔 세부사항(11/2, 머리·옷·속옷 색 등) — 프롬프트와 캐시 키에 같이 들어간다. 호출자가 안전 검사를 마친 값. */
  details?: string
  /** 사진 시트에서 고른 장면·구도(11/2, 영어 태그) — Modal 경로에서만 쓴다. couple 이면 상대 인물도 그린다. */
  scene?: { tags: string; couple: boolean }
  /** 같은 장면의 몇 번째 버전인지(4장 묶음) — Modal 경로에서만. */
  seed?: number
  /** 지금 순간의 장면 글(11/3) — 장면을 고르지 않았을 때 자세·표정·옷·장소를 여기서 읽는다. 호출자가 언베일 원문은 빼고 넘긴다. */
  moment?: string
}): Promise<MediaResult> {
  const identity = await activeVisualIdentity(opts.characterId)
  const context = { ...opts.context, visualVersion: identity.version }
  // 세부사항이 있으면 제작자 장면 사진(그 세부사항을 모르는 그림)으로 대신하지 않는다.
  // 11/2: Modal 이 켜져 있으면 제작자 사진으로 대신하지 않는다 — 누를 때마다 새로 그린다(같은 사진을 무료로 반복하지 않게).
  if(opts.kind==='photo' && !opts.details && !modalImageReady()) {
    const [character]=await db.select({images:characters.images,dialogue:characters.sampleDialogue}).from(characters).where(eq(characters.id,opts.characterId)).limit(1)
    const authored=(character?.dialogue??[]).filter(d=>d.image&&d.location).map(d=>({characterId:opts.characterId,mode:'normal',url:d.image,location:d.location,...(d.time?{time:d.time}:{})}))
    const configured:unknown=JSON.parse(process.env.MIRO_SCENE_ASSETS||'[]')
    const asset=matchSceneAsset([...authored,...(Array.isArray(configured)?configured:[])],{characterId:opts.characterId,sessionId:opts.sessionId,
      mode:opts.unveil?'unveil':'normal',context,publicUrls:[...(character?.images??[]),...(character?.dialogue.flatMap(d=>d.image?[d.image]:[])??[])]})
    if(asset) return {id:randomUUID(),url:asset.url,cached:true,providerNotice:null}
  }
  // 11/2: 학습한 LoRA 가 있는 Modal 로 일반·언베일 사진 모두. 성인(19+) 캐릭터만 — 그림체가 성인 데이터로 학습돼서
  // 학생 캐릭터의 일반 사진은 아래 기존 경로로 둔다(언베일은 원래 19+ 만 허용).
  if (opts.kind === 'photo' && modalImageReady()) {
    const [c] = await db.select({ audience: characters.audience, age: characters.age, images: characters.images }).from(characters).where(eq(characters.id, opts.characterId)).limit(1)
    const age = Number.parseInt(String(c?.age ?? ''), 10)
    if (c && Number.isFinite(age) && age >= 19) return modalPhoto(opts, identity, context, c.audience, c.images?.[0])
    if (opts.unveil) throw new Error('unveil_image_unavailable')
  }
  if (opts.unveil && opts.kind === 'photo') {
    if(!openImageReady()) throw new Error('unveil_image_unavailable')
    return unveilPhoto({ ...opts, unveil: opts.unveil }, identity, context)
  }
  const cacheKey = buildMediaKey(opts.kind, context) + (opts.details ? `:d:${opts.details}` : '')

  const hit = await db.select({ id: generatedMedia.id, url: generatedMedia.url })
    .from(generatedMedia)
    .where(and(
      eq(generatedMedia.characterId, opts.characterId),
      eq(generatedMedia.sessionId, opts.sessionId),
      eq(generatedMedia.kind, opts.kind),
      eq(generatedMedia.cacheKey, cacheKey),
    ))
    .limit(1)

  if (hit[0]) return { ...hit[0], cached: true, providerNotice: notice() }

  const prompt = [buildVisualPrompt({
    identity: identity as never,
    characterName: opts.characterName,
    context,
    kind: opts.kind,
  }), opts.details].filter(Boolean).join(', ')

  const usageKind = opts.kind === 'background' ? 'background'
    : opts.kind === 'face_cast' ? 'faceCast'
    : opts.kind === 'live_scene' ? 'liveScene' : 'photo'
  const provider = resolveImage()
  const [session] = await db.select({ userId: roleplaySessions.userId }).from(roleplaySessions).where(eq(roleplaySessions.id, opts.sessionId)).limit(1)
  const generate = () => budgetedImage({kind:opts.kind,info:provider.info,userId:session?.userId ?? null,sessionId:opts.sessionId,usageUnits:opts.usage ? usageWeight(usageKind) : 0}, () => provider.generate({
    prompt, sceneKey: cacheKey, aspect: opts.aspect ?? (opts.kind === 'background' ? '16:9' : '3:4'),
  }))
  const generateAndSave = async () => {
    const image = await generate()
    const [saved] = await db.insert(generatedMedia).values({
      sessionId: opts.sessionId,
      characterId: opts.characterId,
      kind: opts.kind,
      url: image.url,
      cacheKey,
      prompt,
      visualIdentityId: identity.id,
      visualIdentityVersion: identity.version,
      providerMetadata: image.providerMetadata,
    }).returning({ id: generatedMedia.id, url: generatedMedia.url })
    return saved!
  }
  // Persist the asset before committing the user's usage. A storage failure refunds their reservation.
  const saved = opts.usage
    ? await guarded(
        { userId: opts.usage.userId, kind: usageKind, idempotencyKey: `media:${opts.usage.userId}:${opts.sessionId}:${cacheKey}` },
        generateAndSave,
      )
    : await generateAndSave()

  return { ...saved, cached: false, providerNotice: notice() }
}

/** 언베일 사진 — 대화방마다 따로(다른 유저와 캐시를 나누지 않는다), 비공개 저장, 기존 사진과 같은 사용량·예산 규칙. */
async function unveilPhoto(
  opts: Parameters<typeof getOrGenerate>[0] & { unveil: NonNullable<Parameters<typeof getOrGenerate>[0]['unveil']> },
  identity: Awaited<ReturnType<typeof activeVisualIdentity>>, context: PhotoContext,
): Promise<MediaResult> {
  // 안전장치: 실존 인물 레퍼런스가 걸린 캐릭터, 미성년·실존 인물 신호가 있는 요청은 그리지 않는다.
  if (identity.hasRealPersonReference) throw new Error('unveil_real_person_reference')
  if (unsafeRequest(opts.unveil.request)) throw new Error(`unveil_request_${unsafeRequest(opts.unveil.request)}`)
  const cacheKey = `unveil:${opts.sessionId}:${opts.unveil.level}:${buildMediaKey(opts.kind, context)}:${opts.unveil.request ?? ''}${opts.details ? `:d:${opts.details}` : ''}`
  const [hit] = await db.select({ id: generatedMedia.id, url: generatedMedia.url }).from(generatedMedia)
    .where(and(eq(generatedMedia.sessionId, opts.sessionId), eq(generatedMedia.kind, 'photo'), eq(generatedMedia.cacheKey, cacheKey))).limit(1)
  if (hit) return { ...hit, cached: true, providerNotice: null }
  const prompt = [buildVisualPrompt({ identity: identity as never, characterName: opts.characterName, context, kind: opts.kind }), opts.details, opts.unveil.request]
    .filter(Boolean).join(', ')
  const [session] = await db.select({ userId: roleplaySessions.userId }).from(roleplaySessions).where(eq(roleplaySessions.id, opts.sessionId)).limit(1)
  const model = (process.env.MIRO_UNVEIL_IMAGE_MODEL === 'pony' ? 'pony' : 'illustrious') as BaseModel
  // ponytail: 얼굴 일관성은 텍스트 외형(Visual Identity)만 — IP-Adapter/img2img 는 RunPod 워커에 확장을 넣은 뒤 붙인다.
  const generateAndSave = async () => {
    const png = await budgetedImage({ kind: 'photo', info: { mode: 'live', name: `open-model:${model}`, notice: null }, userId: session?.userId ?? null,
      sessionId: opts.sessionId, usageUnits: opts.usage ? usageWeight('photo') : 0 },
      () => generateLocalImage({ model, prompt, characterAge: opts.unveil.characterAge, mature: true, level: opts.unveil.level, width: 832, height: 1216 }))
    const id = randomUUID()
    const storage = await saveMessengerImage(opts.sessionId, id, `data:image/png;base64,${png.toString('base64')}`)
    const [saved] = await db.insert(generatedMedia).values({
      id, sessionId: opts.sessionId, characterId: opts.characterId, kind: 'photo', url: `/api/messenger-images/${id}`, cacheKey, prompt,
      visualIdentityId: identity.id, visualIdentityVersion: identity.version,
      providerMetadata: { provider: `open-model:${model}`, unveilLevel: opts.unveil.level, storage },
    }).returning({ id: generatedMedia.id, url: generatedMedia.url })
    return saved!
  }
  const saved = opts.usage
    ? await guarded({ userId: opts.usage.userId, kind: 'photo', idempotencyKey: `media:${opts.usage.userId}:${cacheKey}` }, generateAndSave)
    : await generateAndSave()
  return { ...saved, cached: false, providerNotice: null }
}

/** Modal 사진(11/2) — 외형·장면·고정 세부사항을 영어 태그로 바꿔 학습한 그림체로. 대화방마다 비공개 저장, 사진 사용량 규칙 그대로. */
async function modalPhoto(
  opts: Parameters<typeof getOrGenerate>[0], identity: Awaited<ReturnType<typeof activeVisualIdentity>>, context: PhotoContext, audience: 'male' | 'female',
  refUrl?: string,
): Promise<MediaResult> {
  if (identity.hasRealPersonReference) throw new Error('unveil_real_person_reference')
  const request = opts.unveil?.request
  if (unsafeRequest(request) || unsafeRequest(opts.details)) throw new Error('unsafe_request')
  const level = opts.unveil ? cappedLevel(opts.unveil.level) : null
  const style = styleFor(audience)
  const seed = opts.seed ?? 11
  const cacheKey = `modal:${opts.sessionId}:${style}:${level ?? 'normal'}:${buildMediaKey(opts.kind, context)}:${request ?? ''}:${opts.details ?? ''}:${opts.scene?.tags ?? ''}:s${seed}`
  const units = opts.usage?.units ?? usageWeight('photo')
  const [hit] = await db.select({ id: generatedMedia.id, url: generatedMedia.url }).from(generatedMedia)
    .where(and(eq(generatedMedia.sessionId, opts.sessionId), eq(generatedMedia.kind, 'photo'), eq(generatedMedia.cacheKey, cacheKey))).limit(1)
  if (hit) return { ...hit, cached: true, providerNotice: null }
  const source = [buildVisualPrompt({ identity: identity as never, characterName: opts.characterName, context, kind: opts.kind }),
    opts.details && `fixed details (keep exactly): ${opts.details}`, request].filter(Boolean).join('\n')
  const [session] = await db.select({ userId: roleplaySessions.userId }).from(roleplaySessions).where(eq(roleplaySessions.id, opts.sessionId)).limit(1)
  const generateAndSave = async () => {
    const tag = level ? levelTags(level) : null
    // 고른 장면 태그는 LLM 을 거치지 않고 그대로(바뀌지 않게), 외형·장소·세부사항만 영어 태그로 바꾼다.
    // 외형·장소·세부사항(look)은 주인공 바로 뒤로, 고른 장면·수위(tags)는 뒤로 — 외형이 상대 인물에게 섞이지 않게.
    const [look, moment] = await Promise.all([toImageTags(source), !opts.scene && opts.moment ? toMomentTags(opts.moment) : Promise.resolve('')])
    const tags = [tag?.positive, opts.scene?.tags ?? moment].filter(Boolean).join(', ')
    const png = await budgetedImage({ kind: 'photo', info: { mode: 'live', name: `modal:${style}`, notice: null }, userId: session?.userId ?? null,
      sessionId: opts.sessionId, usageUnits: opts.usage ? units : 0 },
      () => generateModalImage({ style, look, tags, unveil: !!tag?.mature, couple: opts.scene?.couple, extraNeg: tag?.negative, seed, refUrl }))
    const id = randomUUID()
    const storage = await saveMessengerImage(opts.sessionId, id, `data:image/png;base64,${png.toString('base64')}`)
    const [saved] = await db.insert(generatedMedia).values({
      id, sessionId: opts.sessionId, characterId: opts.characterId, kind: 'photo', url: `/api/messenger-images/${id}`, cacheKey, prompt: [look, tags].filter(Boolean).join(' | '),
      visualIdentityId: identity.id, visualIdentityVersion: identity.version,
      providerMetadata: { provider: `modal:${style}`, unveilLevel: level, storage },
    }).returning({ id: generatedMedia.id, url: generatedMedia.url })
    return saved!
  }
  const saved = opts.usage
    ? await guarded({ userId: opts.usage.userId, kind: 'photo', units, idempotencyKey: `media:${opts.usage.userId}:${cacheKey}` }, generateAndSave)
    : await generateAndSave()
  return { ...saved, cached: false, providerNotice: null }
}

/**
 * 지금 순간의 장면 글(11/3) — 최근 사용자 말과 캐릭터의 서술·행동·대사(최대 900자). 사진이 그 순간 맥락대로 나오게.
 * 언베일 모델이 쓴 원문(is_explicit)은 빼고 넘긴다 — 태그 변환은 상용 모델이 한다(원문이 공급자에게 가지 않게).
 */
export async function sceneMoment(sessionId: string): Promise<string> {
  const rows = await db.select({ role: messages.role, content: messages.content, blocks: messages.blocks, explicit: messages.isExplicit }).from(messages)
    .where(and(eq(messages.sessionId, sessionId), isNull(messages.hiddenAt), inArray(messages.role, ['user', 'character', 'narrator']), inArray(messages.kind, ['text'])))
    .orderBy(desc(messages.createdAt)).limit(4)
  const lines = rows.reverse().filter(r => !r.explicit).map(r => {
    if (r.role === 'user') return `사용자: ${r.content}`
    const blocks = (r.blocks as Array<{ type?: string; text?: string }> | null) ?? []
    const text = blocks.filter(b => b.type && ['narrative', 'action', 'dialogue'].includes(b.type)).map(b => b.text).filter(Boolean).join(' ')
    return `장면: ${text || r.content}`
  })
  return lines.join('\n').slice(-900)
}

/** 캐시된 asset 도 Mock 으로 만들어졌다면 그 사실을 계속 알린다. */
function notice(): string | null {
  return resolveImage().info.notice
}

/**
 * 현재 세계 상태에서 미디어 컨텍스트를 만든다.
 *
 * Photo / Background / Live Scene 이 모두 같은 World State 를 읽으므로
 * Chat 에서 도쿄로 이동했다면 사진도 도쿄가 된다.
 */
export async function contextFromWorld(sessionId: string): Promise<PhotoContext | null> {
  const rows = await db.select({
    location: worldStates.currentLocation,
    time: worldStates.currentTime,
    status: worldStates.worldStatus,
  })
    .from(worldStates)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, worldStates.sessionId))
    .where(eq(worldStates.sessionId, sessionId))
    .limit(1)

  const w = rows[0]
  if (!w) return null

  return {
    location: w.location,
    time: w.time,
    mood: w.status ?? 'neutral',
    outfit: '',
    visualVersion: 0,   // getOrGenerate 가 실제 버전으로 덮어쓴다
  }
}
