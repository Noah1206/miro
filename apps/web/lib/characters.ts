import { and, or, eq, isNull } from 'drizzle-orm'
import { db, characters, worlds } from '@miro/db'

export type OfficialCard = {
  id: string
  slug: string
  name: string
  role: string | null
  occupation: string | null
  relationshipKeywords: string[]
  accentA: string | null
  accentB: string | null
  /** 홈의 장르 행을 가르는 값. worlds.genre 는 '느와르 · 범죄 드라마' 처럼 여러 개가 붙어 온다. */
  genre: string | null
  /** 카드에 얹는 한 줄 — 캐릭터가 직접 하는 말. */
  tagline: string | null
  /** 사용자가 올린 사진. 첫 번째가 대표. 공식 캐릭터는 비어 있고 portraitFor(slug) 가 대신한다. */
  images: string[]
}

/** Home 은 대량 Grid 가 아니라 3인 중심의 작품 포스터형 카드다 (명세서 2.1 표시). */
export async function listOfficials(): Promise<OfficialCard[]> {
  return db
    .select({
      id: characters.id,
      slug: characters.slug,
      ownerId: characters.ownerId,
      isOfficial: characters.isOfficial,
      isPublic: characters.isPublic,
      name: characters.name,
      role: characters.role,
      occupation: characters.occupation,
      relationshipKeywords: characters.relationshipKeywords,
      accentA: characters.accentA,
      accentB: characters.accentB,
      genre: worlds.genre,
      tagline: characters.tagline,
      images: characters.images,
    })
    .from(characters)
    .leftJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(eq(characters.isOfficial, true), isNull(characters.deletedAt)))
    .orderBy(characters.createdAt) as Promise<OfficialCard[]>
}

export type CharacterDetail = Awaited<ReturnType<typeof getOfficialBySlug>>

/** 상세는 핵심만 보여준다 — 긴 설정집을 강제하지 않는다 (명세서 2.1). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * 상세용 조회. 공식 캐릭터는 slug, 사용자 캐릭터는 id 로 온다 (카드가 `slug ?? id` 로 링크한다).
 * uuid 열에 아무 문자열이나 비교하면 Postgres 가 던지므로 모양을 보고 갈래를 정한다.
 * 보이는 조건: 공식이거나, 공개했거나, 내 것. 초안은 본인에게도 상세로 보이지 않는다 — 편집 화면이 그 자리다.
 */
export async function getCharacterByKey(key: string, viewerId: string | null) {
  const byKey = UUID.test(key) ? eq(characters.id, key) : eq(characters.slug, key)
  const visible = viewerId
    ? or(eq(characters.isOfficial, true), eq(characters.isPublic, true), eq(characters.ownerId, viewerId))
    : or(eq(characters.isOfficial, true), eq(characters.isPublic, true))
  return getOne(and(byKey, visible, eq(characters.isDraft, false), isNull(characters.deletedAt)))
}

/** 공식 캐릭터 slug 조회 — 예전 호출자용. 공개 캐릭터도 같은 규칙으로 보인다. */
export async function getOfficialBySlug(slug: string) {
  return getCharacterByKey(slug, null)
}

async function getOne(where: ReturnType<typeof and>) {
  const rows = await db
    .select({
      id: characters.id,
      slug: characters.slug,
      ownerId: characters.ownerId,
      isOfficial: characters.isOfficial,
      isPublic: characters.isPublic,
      name: characters.name,
      role: characters.role,
      age: characters.age,
      nationality: characters.nationality,
      occupation: characters.occupation,
      relationshipKeywords: characters.relationshipKeywords,
      accentA: characters.accentA,
      accentB: characters.accentB,
      socialPosition: characters.socialPosition,
      startingContext: characters.startingContext,
      tagline: characters.tagline,
      sampleDialogue: characters.sampleDialogue,
      mbti: characters.mbti,
      personality: characters.personality,
      values: characters.values,
      speechStyle: characters.speechStyle,
      hobbies: characters.hobbies,
      dislikes: characters.dislikes,
      startingTime: characters.startingTime,
      images: characters.images,
      worldLocation: worlds.location,
      worldEra: worlds.era,
      worldGenre: worlds.genre,
      worldSetting: worlds.worldSetting,
    })
    .from(characters)
    .leftJoin(worlds, eq(worlds.characterId, characters.id))
    .where(where)
    .limit(1)

  return rows[0] ?? null
}
