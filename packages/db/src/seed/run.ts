import { eq } from 'drizzle-orm'
import { db } from '../client'
import { characterVisualIdentities, characters, contactProfiles, worlds } from '../schema/index'
import { OFFICIAL_CHARACTERS } from './officials'

/**
 * 공식 캐릭터 시드. slug 기준 upsert 이므로 반복 실행해도 중복이 생기지 않는다.
 * 관계/세계 상태는 여기서 만들지 않는다 — 사용자가 역할극을 시작할 때
 * 세션별로 생성되어야 같은 캐릭터라도 사용자마다 다른 관계가 형성된다.
 */
export async function seedOfficials(): Promise<void> {
  for (const c of OFFICIAL_CHARACTERS) {
    const existing = await db.select({ id: characters.id })
      .from(characters).where(eq(characters.slug, c.slug)).limit(1)

    const values = {
      slug: c.slug,
      ownerId: null,
      isOfficial: true,
      name: c.name,
      age: c.age,
      nationality: c.nationality,
      occupation: c.occupation,
      mbti: c.mbti,
      personality: c.personality,
      values: c.values,
      speechStyle: c.speechStyle,
      hobbies: c.hobbies,
      dislikes: c.dislikes,
      jealousy: c.jealousy,
      initiative: c.initiative,
      emotionalExpression: c.emotionalExpression,
      socialPosition: c.socialPosition,
      startingContext: c.startingContext,
      role: c.role,
      tagline: c.tagline,
      sampleDialogue: c.sampleDialogue,
      relationshipKeywords: c.relationshipKeywords,
      accentA: c.accent.a,
      accentB: c.accent.b,
      initialRelationship: c.initialRelationship,
      isDraft: false,
    }

    const characterId = existing[0]
      ? (await db.update(characters).set(values)
          .where(eq(characters.id, existing[0].id)).returning({ id: characters.id }))[0]!.id
      : (await db.insert(characters).values(values).returning({ id: characters.id }))[0]!.id

    const w = await db.select({ id: worlds.id })
      .from(worlds).where(eq(worlds.characterId, characterId)).limit(1)
    if (w[0]) {
      await db.update(worlds).set(c.world).where(eq(worlds.id, w[0].id))
    } else {
      await db.insert(worlds).values({ characterId, ...c.world })
    }

    await db.insert(contactProfiles)
      .values({ characterId, ...c.contact })
      .onConflictDoUpdate({ target: contactProfiles.characterId, set: c.contact })

    /**
     * 외형. 없으면 만들고, 있으면 덮어쓴다 (version 은 그대로).
     * 버전을 올리면 캐시 키가 갈라져 이미 만들어 둔 이미지를 전부 버리게 되므로,
     * 시드 재실행이 그 비용을 내지 않도록 같은 판을 갱신한다.
     */
    const identity = {
      baseFace: c.appearance.baseFace,
      hair: c.appearance.hair,
      bodyProfile: c.appearance.body,
      styleTags: c.appearance.styleTags,
      expressionTendency: c.appearance.expression,
      referenceSource: 'text' as const,
    }
    const v = await db.select({ id: characterVisualIdentities.id })
      .from(characterVisualIdentities)
      .where(eq(characterVisualIdentities.characterId, characterId)).limit(1)
    if (v[0]) {
      await db.update(characterVisualIdentities).set(identity)
        .where(eq(characterVisualIdentities.id, v[0].id))
    } else {
      await db.insert(characterVisualIdentities).values({ characterId, ...identity })
    }
  }
}
