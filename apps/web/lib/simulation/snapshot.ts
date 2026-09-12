import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import {
  db, characters, events, memories, messages, npcs, relationships,
  roleplaySessions, scenes, worldStates, worlds,
} from '@miro/db'
import type { SimulationSnapshot } from '@miro/engine'

export type LoadedSession = {
  snapshot: SimulationSnapshot
  sessionId: string
  characterId: string
  characterName: string
}

/**
 * 재진입 시 마지막 메시지가 아니라 Simulation State 전체를 복구한다.
 * 본인 세션만 조회 가능하다.
 */
export async function loadSession(
  sessionId: string,
  userId: string,
): Promise<LoadedSession | null> {
  const rows = await db
    .select({ session: roleplaySessions, character: characters, world: worldStates,
              relationship: relationships, worldSetting: worlds.worldSetting })
    .from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .innerJoin(worldStates, eq(worldStates.sessionId, roleplaySessions.id))
    .innerJoin(relationships, eq(relationships.sessionId, roleplaySessions.id))
    .leftJoin(worlds, eq(worlds.id, roleplaySessions.worldId))
    .where(and(
      eq(roleplaySessions.id, sessionId),
      eq(roleplaySessions.userId, userId),
      isNull(roleplaySessions.deletedAt),
    ))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  const [allEvents, sessionNpcs, sessionMemories, currentScene, recent] = await Promise.all([
    db.select().from(events).where(eq(events.sessionId, sessionId)),
    db.select().from(npcs).where(and(eq(npcs.sessionId, sessionId), eq(npcs.isActive, true))),
    db.select().from(memories).where(eq(memories.sessionId, sessionId)),
    row.world.currentSceneId
      ? db.select().from(scenes).where(eq(scenes.id, row.world.currentSceneId)).limit(1)
      : Promise.resolve([]),
    db.select().from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.turnIndex), desc(messages.createdAt))
      .limit(24),
  ])

  const c = row.character
  const snapshot: SimulationSnapshot = {
    character: {
      id: c.id, ownerId: c.ownerId, isOfficial: c.isOfficial,
      identity: {
        name: c.name, age: c.age, nationality: c.nationality,
        occupation: c.occupation, mbti: c.mbti,
      },
      personality: {
        personality: c.personality, values: c.values, speechStyle: c.speechStyle,
        userNickname: c.userNickname, hobbies: c.hobbies, dislikes: c.dislikes,
        jealousy: c.jealousy, initiative: c.initiative,
        emotionalExpression: c.emotionalExpression,
      },
      worldRole: { socialPosition: c.socialPosition, startingContext: c.startingContext },
      visualIdentityId: null, contactProfileId: null,
    },
    world: row.world as never,
    worldSetting: row.worldSetting,
    relationship: row.relationship as never,
    scene: (currentScene[0] ?? null) as never,
    memories: sessionMemories.map((m) => ({
      ...m,
      importance: m.importance / 100,
      persistence: m.persistence / 100,
      confidence: m.confidence / 100,
    })) as never,
    recentMessages: recent.reverse()
      .filter((m) => m.role === 'user' || m.role === 'character')
      .map((m) => ({ role: m.role as 'user' | 'character', content: m.content })),
    activeEvents: allEvents.filter((e) => e.status === 'active' || e.status === 'escalated') as never,
    recentlyResolvedEvents: allEvents.filter((e) => e.status === 'resolved') as never,
    activeNpcs: sessionNpcs as never,
    recentRealityContacts: [],
    outputStyle: row.session.outputStyle,
    turnCount: row.session.turnCount,
  }

  return {
    snapshot,
    sessionId,
    characterId: c.id,
    characterName: c.name,
  }
}

export { inArray }
