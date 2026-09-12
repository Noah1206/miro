import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, characters, relationships, roleplaySessions, worldStates } from '@miro/db'
import { stageLabel } from '@miro/domain'
import { listOfficials, type OfficialCard } from './characters'

export type Featured = OfficialCard & {
  sessionId: string | null
  /** 한 줄 상황: 캐릭터 상태 → 현재 장면 → 시작 상황 순으로. */
  situation: string | null
  relationship: string | null
}

/** 홈의 주인공: 가장 최근에 이어진 인연. 없으면 첫 공식 캐릭터. */
export async function featuredFor(userId: string): Promise<{ featured: Featured; others: OfficialCard[] }> {
  const officials = await listOfficials()
  const [last] = await db.select({ session: roleplaySessions, character: characters, world: worldStates, rel: relationships })
    .from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .innerJoin(worldStates, eq(worldStates.sessionId, roleplaySessions.id))
    .innerJoin(relationships, eq(relationships.sessionId, roleplaySessions.id))
    .where(and(eq(roleplaySessions.userId, userId), eq(roleplaySessions.status, 'active'), isNull(roleplaySessions.deletedAt)))
    .orderBy(desc(roleplaySessions.lastInteractionAt)).limit(1)

  if (last && last.character.isOfficial && last.character.slug) {
    const base = officials.find((o) => o.slug === last.character.slug)!
    return {
      featured: {
        ...base, sessionId: last.session.id,
        situation: last.session.characterStatus ?? `${last.world.currentLocation} · ${last.world.currentTime}`,
        relationship: stageLabel(last.rel.stage as never, last.rel as never),
      },
      others: officials.filter((o) => o.slug !== last.character.slug),
    }
  }
  const first = officials[0]!
  const [row] = await db.select({ ctx: characters.startingContext }).from(characters).where(eq(characters.id, first.id)).limit(1)
  return {
    featured: { ...first, sessionId: null, situation: row?.ctx?.split(/(?<=[.!?。])\s/)[0] ?? null, relationship: null },
    others: officials.slice(1),
  }
}
