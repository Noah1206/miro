import { and, eq, isNull } from 'drizzle-orm'
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
}

/** Home 은 대량 Grid 가 아니라 3인 중심의 작품 포스터형 카드다 (명세서 2.1 표시). */
export async function listOfficials(): Promise<OfficialCard[]> {
  return db
    .select({
      id: characters.id,
      slug: characters.slug,
      name: characters.name,
      role: characters.role,
      occupation: characters.occupation,
      relationshipKeywords: characters.relationshipKeywords,
      accentA: characters.accentA,
      accentB: characters.accentB,
      genre: worlds.genre,
      tagline: characters.tagline,
    })
    .from(characters)
    .leftJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(eq(characters.isOfficial, true), isNull(characters.deletedAt)))
    .orderBy(characters.createdAt) as Promise<OfficialCard[]>
}

export type CharacterDetail = Awaited<ReturnType<typeof getOfficialBySlug>>

/** 상세는 핵심만 보여준다 — 긴 설정집을 강제하지 않는다 (명세서 2.1). */
export async function getOfficialBySlug(slug: string) {
  const rows = await db
    .select({
      id: characters.id,
      slug: characters.slug,
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
      mbti: characters.mbti,
      personality: characters.personality,
      values: characters.values,
      speechStyle: characters.speechStyle,
      hobbies: characters.hobbies,
      dislikes: characters.dislikes,
      startingTime: characters.startingTime,
      worldLocation: worlds.location,
      worldEra: worlds.era,
      worldGenre: worlds.genre,
      worldSetting: worlds.worldSetting,
    })
    .from(characters)
    .leftJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(
      eq(characters.slug, slug),
      eq(characters.isOfficial, true),
      isNull(characters.deletedAt),
    ))
    .limit(1)

  return rows[0] ?? null
}
