import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db, characters, characterVisualIdentities, messages, roleplaySessions, users, worlds } from '@miro/db'
import { memoryRetriever } from '@/lib/ai/memory'
import { characterContext, conversationContext } from '@/lib/simulation/character-context'

/** Only visible, owned conversation data may ground a proactive message. */
export async function loadRealityContext(sessionId: string, userId: string, reason: string) {
  const [owner] = await db.select({ id: roleplaySessions.id, character: characters, worldSetting: worlds.worldSetting, worldGenre: worlds.genre }).from(roleplaySessions)
    .innerJoin(users, eq(users.id, roleplaySessions.userId))
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .leftJoin(worlds, eq(worlds.id, roleplaySessions.worldId))
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId),
      isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt), isNull(users.deletedAt), isNull(characters.deletedAt))).limit(1)
  if (!owner) return null
  const [recent, memories, visual] = await Promise.all([
    db.select().from(messages)
      .where(and(eq(messages.sessionId, sessionId), isNull(messages.hiddenAt), inArray(messages.role, ['user', 'character', 'narrator', 'npc'])))
      .orderBy(desc(messages.turnIndex), desc(messages.createdAt), desc(messages.id)).limit(12),
    memoryRetriever.retrieve({ sessionId, userId, query: reason, limit: 8 }),
    db.select().from(characterVisualIdentities)
      .where(and(eq(characterVisualIdentities.characterId, owner.character.id), eq(characterVisualIdentities.isActive, true)))
      .orderBy(desc(characterVisualIdentities.version), desc(characterVisualIdentities.createdAt), desc(characterVisualIdentities.id)).limit(1),
  ])
  const { identity, personality, worldRole, appearance } = characterContext(owner.character, visual[0])
  return {
    authoredCharacter: { identity, personality, worldRole, ...(appearance ? { appearance } : {}) },
    worldSetting: owner.worldSetting,
    worldGenre: owner.worldGenre,
    recentMessages: conversationContext(recent.reverse()).map(m => ({ ...m, content: m.content.slice(0, 1000),
      blocks: m.blocks?.map(b => ({ ...b, text: b.text.slice(0, 1000) })) })),
    memories: memories.map(m => ({ id: m.id, type: m.type, content: m.content.slice(0, 600), sourceMessageId: m.sourceMessageId, at: m.createdAt.toISOString() })),
  }
}
