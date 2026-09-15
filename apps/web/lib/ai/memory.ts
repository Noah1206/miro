import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db, memories, roleplaySessions } from '@miro/db'
import type { Memory, MemoryRetriever } from '@miro/domain'
/** Bounded SQL retrieval with ownership enforced; vector adapters implement the same contract. */
export const memoryRetriever: MemoryRetriever = {
  async retrieve(q) {
    const limit = Math.min(32, Math.max(1, q.limit))
    const terms = q.query.trim().split(/\s+/).filter(t => t.length >= 2).slice(0, 8)
    const relevance = terms.length ? sql`(${sql.join(terms.map(t => sql`case when strpos(lower(${memories.content}), lower(${t})) > 0 then 100 else 0 end`), sql` + `)})` : sql`0`
    const rows = await db.select({ m: memories }).from(memories).innerJoin(roleplaySessions, eq(roleplaySessions.id, memories.sessionId))
      .where(and(eq(memories.sessionId, q.sessionId), eq(roleplaySessions.userId, q.userId), isNull(roleplaySessions.deletedAt)))
      .orderBy(sql`${relevance} + ${memories.importance} desc`, desc(memories.createdAt)).limit(limit)
    return rows.map(({ m }) => ({ ...m, importance: m.importance / 100, persistence: m.persistence / 100, confidence: m.confidence / 100 })) as Memory[]
  },
}
