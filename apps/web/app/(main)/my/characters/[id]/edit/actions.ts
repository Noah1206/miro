'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { and, desc } from 'drizzle-orm'
import { db, characters, worlds, contactProfiles, characterVisualIdentities } from '@miro/db'
import { BUILD_TYPES } from '@miro/domain'
import { requireUser } from '@/lib/auth'
import { getOwnedCharacter } from '@/lib/owned'

const score = z.coerce.number().int().min(0).max(100)

/** 섹션 단위 저장. 전체 폼을 한 번에 제출하도록 강제하지 않는다. */
const Sections = {
  identity: z.object({
    name: z.string().min(1).max(40),
    age: z.coerce.number().int().min(18).max(99).nullable().catch(null),
    nationality: z.string().max(40).nullable().catch(null),
    occupation: z.string().max(60).nullable().catch(null),
    mbti: z.string().max(4).nullable().catch(null),
  }),
  personality: z.object({
    personality: z.string().min(1).max(600),
    values: z.string().max(300).nullable().catch(null),
    speechStyle: z.string().max(300).nullable().catch(null),
    jealousy: score,
    initiative: score,
    emotionalExpression: score,
  }),
  world: z.object({
    era: z.string().max(40),
    location: z.string().max(60),
    genre: z.string().max(60),
    worldSetting: z.string().max(600),
  }),
  /**
   * 외형. 바꾸면 version 이 올라가 캐시 키가 갈라진다 — 이전 외형으로 만든 이미지를 재사용하지 않는다.
   */
  appearance: z.object({
    eyes: z.string().max(80).nullable().catch(null),
    nose: z.string().max(80).nullable().catch(null),
    jaw: z.string().max(80).nullable().catch(null),
    skin: z.string().max(80).nullable().catch(null),
    distinctive: z.string().max(100).nullable().catch(null),
    hairColor: z.string().max(40).nullable().catch(null),
    hairLength: z.string().max(40).nullable().catch(null),
    hairStyle: z.string().max(60).nullable().catch(null),
    build: z.enum(BUILD_TYPES),
    height: z.string().max(20).nullable().catch(null),
    detail: z.string().max(120).nullable().catch(null),
    expression: z.string().max(120).nullable().catch(null),
  }),
  contact: z.object({
    contactFrequency: score,
    replyDelayMinutes: z.coerce.number().int().min(0).max(1440),
    callProbability: score,
    videoCallProbability: score,
    photoProbability: score,
    voiceMessageProbability: score,
    activeHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
    activeHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
    initiativeLevel: score,
  }),
} as const

export type EditState = { saved: string | null; error: string | null }

export async function saveSection(_prev: EditState, form: FormData): Promise<EditState> {
  const user = await requireUser()

  const characterId = String(form.get('characterId') ?? '')
  const section = String(form.get('section') ?? '') as keyof typeof Sections

  const schema = Sections[section]
  if (!schema) return { saved: null, error: '알 수 없는 항목입니다.' }

  const owned = await getOwnedCharacter(characterId, user.id)
  if (!owned) return { saved: null, error: '수정 권한이 없습니다.' }

  const raw = Object.fromEntries(
    Object.keys(schema.shape).map((k) => [k, form.get(k) === '' ? null : form.get(k)]),
  )
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { saved: null, error: parsed.error.issues[0]?.message ?? '입력을 확인해 주세요.' }
  }

  if (section === 'appearance') {
    const a = parsed.data as z.infer<typeof Sections.appearance>
    const [current] = await db.select().from(characterVisualIdentities)
      .where(and(
        eq(characterVisualIdentities.characterId, characterId),
        eq(characterVisualIdentities.isActive, true),
      ))
      .orderBy(desc(characterVisualIdentities.version)).limit(1)

    const values = {
      baseFace: { eyes: a.eyes, nose: a.nose, jaw: a.jaw, skin: a.skin, distinctive: a.distinctive },
      hair: { color: a.hairColor, length: a.hairLength, style: a.hairStyle },
      bodyProfile: { build: a.build, height: a.height, detail: a.detail },
      expressionTendency: a.expression,
    }
    if (current) {
      // 외형이 바뀌었으면 판을 올린다. 같으면 그대로 둬서 캐시를 버리지 않는다.
      const changed = JSON.stringify({
        baseFace: current.baseFace, hair: current.hair,
        bodyProfile: current.bodyProfile, expressionTendency: current.expressionTendency,
      }) !== JSON.stringify(values)
      await db.update(characterVisualIdentities)
        .set({ ...values, version: changed ? current.version + 1 : current.version })
        .where(eq(characterVisualIdentities.id, current.id))
    } else {
      await db.insert(characterVisualIdentities).values({ characterId, ...values, referenceSource: 'text' })
    }
  } else if (section === 'world') {
    await db.update(worlds).set(parsed.data as never).where(eq(worlds.characterId, characterId))
  } else if (section === 'contact') {
    await db.update(contactProfiles).set(parsed.data as never)
      .where(eq(contactProfiles.characterId, characterId))
  } else {
    await db.update(characters).set(parsed.data as never).where(eq(characters.id, characterId))
  }

  revalidatePath(`/my/characters/${characterId}/edit`)
  return { saved: section, error: null }
}
