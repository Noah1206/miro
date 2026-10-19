import { randomUUID } from 'node:crypto'
import { budgetedImage } from '@/lib/ai/media-budget'
import { generateLocalImage, openImageReady, unsafeRequest, type BaseModel, type UnveilLevel } from '@/lib/ai/local-image'
import { saveMessengerImage } from '@/lib/storage/messenger-images'
import { usageWeight } from '@miro/config'
import { and, desc, eq } from 'drizzle-orm'
import {
  db, characterVisualIdentities, generatedMedia, roleplaySessions, worldStates,
} from '@miro/db'
import { buildMediaKey, buildVisualPrompt, type MediaKind, type PhotoContext } from '@miro/domain'
import { resolveImage } from '@miro/providers'
import { guarded } from '@/lib/usage/guard'
import { hasAppearance, inferAppearance } from './appearance'

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
  usage: { userId: string } | null
  /**
   * 언베일 사진(10/19) — 호출자가 adultModeGateFor 를 통과한 대화방에서만 넘긴다. 자체 오픈 모델로 그리고,
   * 결과는 그 대화방 주인만 열 수 있는 비공개 버킷에만 둔다. 공급자가 없으면 무시하고 기존 경로로 간다.
   */
  unveil?: { level: UnveilLevel; characterAge: number; request?: string } | null
}): Promise<MediaResult> {
  const identity = await activeVisualIdentity(opts.characterId)
  const context = { ...opts.context, visualVersion: identity.version }
  if (opts.unveil && opts.kind === 'photo' && openImageReady()) return unveilPhoto({ ...opts, unveil: opts.unveil }, identity, context)
  const cacheKey = buildMediaKey(opts.kind, context)

  const hit = await db.select({ id: generatedMedia.id, url: generatedMedia.url })
    .from(generatedMedia)
    .where(and(
      eq(generatedMedia.characterId, opts.characterId),
      eq(generatedMedia.kind, opts.kind),
      eq(generatedMedia.cacheKey, cacheKey),
    ))
    .limit(1)

  if (hit[0]) return { ...hit[0], cached: true, providerNotice: notice() }

  const prompt = buildVisualPrompt({
    identity: identity as never,
    characterName: opts.characterName,
    context,
    kind: opts.kind,
  })

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
        { userId: opts.usage.userId, kind: usageKind, idempotencyKey: `media:${opts.usage.userId}:${cacheKey}:${Date.now()}` },
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
  const cacheKey = `unveil:${opts.sessionId}:${opts.unveil.level}:${buildMediaKey(opts.kind, context)}:${opts.unveil.request ?? ''}`
  const [hit] = await db.select({ id: generatedMedia.id, url: generatedMedia.url }).from(generatedMedia)
    .where(and(eq(generatedMedia.sessionId, opts.sessionId), eq(generatedMedia.kind, 'photo'), eq(generatedMedia.cacheKey, cacheKey))).limit(1)
  if (hit) return { ...hit, cached: true, providerNotice: null }
  const prompt = [buildVisualPrompt({ identity: identity as never, characterName: opts.characterName, context, kind: opts.kind }), opts.unveil.request]
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
    ? await guarded({ userId: opts.usage.userId, kind: 'photo', idempotencyKey: `media:${opts.usage.userId}:${cacheKey}:${Date.now()}` }, generateAndSave)
    : await generateAndSave()
  return { ...saved, cached: false, providerNotice: null }
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
