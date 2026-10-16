import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { db, memories, messages, roleplaySessions } from '@miro/db'
import { retrieveMemories, type Memory, type MemoryRetriever } from '@miro/domain'
import { POLICY } from '@miro/config'
import { characterCanSeeMessage } from '@/lib/messenger/inbox'
/** Ownership-scoped bounded candidate pool, ranked by the same rules the engine uses. */
export const memoryRetriever: MemoryRetriever = {
  async retrieve(q) {
    const limit = Math.min(32, Math.max(1, q.limit))
    const scope = and(eq(memories.sessionId, q.sessionId), eq(roleplaySessions.userId, q.userId), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt))
    // At most the session's existing retention cap, rather than throwing away low lexical matches
    // before tag/inflection/diversity ranking. No whole transcript is loaded into the dialogue prompt.
    const rows = await db.select({ m: memories, sourceOccurredAt: messages.createdAt, sourceText: messages.content, sourceRole: messages.role }).from(memories).innerJoin(roleplaySessions, eq(roleplaySessions.id, memories.sessionId))
      .leftJoin(messages, and(eq(messages.id, memories.sourceMessageId), eq(messages.sessionId, memories.sessionId), or(eq(messages.role, 'user'), and(eq(messages.role, 'character'), eq(memories.type, 'shared_event'))), isNull(messages.hiddenAt), characterCanSeeMessage))
      .where(scope).orderBy(desc(memories.createdAt), desc(memories.id)).limit(POLICY.memory.maxPerSession)
    const candidates = rows.map(({ m, sourceOccurredAt, sourceText, sourceRole }) => ({ ...m, sourceOccurredAt, sourceText, sourceRole, importance: m.importance / 100, persistence: m.persistence / 100, confidence: m.confidence / 100 })) as Memory[]
    const summary = candidates.find(m => m.type === 'short_term_summary')
    return [...(summary ? [summary] : []), ...retrieveMemories(candidates.filter(m => m.type !== 'short_term_summary'), q.sessionId, limit - (summary ? 1 : 0), q.query)]
  },
}
