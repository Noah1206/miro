import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, messages, roleplaySessions, users } from '@miro/db'
import { memoryRetriever } from '@/lib/ai/memory'

/** Only visible, owned conversation data may ground a proactive message. */
export async function loadRealityContext(sessionId: string, userId: string, reason: string) {
  const [owner] = await db.select({ id: roleplaySessions.id }).from(roleplaySessions)
    .innerJoin(users, eq(users.id, roleplaySessions.userId))
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId),
      isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt), isNull(users.deletedAt))).limit(1)
  if (!owner) return null
  const [recent, memories] = await Promise.all([
    db.select({ role: messages.role, content: messages.content, createdAt: messages.createdAt }).from(messages)
      .where(and(eq(messages.sessionId, sessionId), isNull(messages.hiddenAt), eq(messages.kind, 'text')))
      .orderBy(desc(messages.createdAt), desc(messages.id)).limit(12),
    memoryRetriever.retrieve({ sessionId, userId, query: reason, limit: 8 }),
  ])
  return {
    recentMessages: recent.reverse().map(m => ({ role: m.role, content: m.content.slice(0, 1000), at: m.createdAt.toISOString() })),
    memories: memories.map(m => ({ type: m.type, content: m.content.slice(0, 600) })),
  }
}
