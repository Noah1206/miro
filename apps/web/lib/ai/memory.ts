import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { db, memories, messages, roleplaySessions } from '@miro/db'
import { retrieveMemories, type Memory, type MemoryRetriever } from '@miro/domain'
import { POLICY } from '@miro/config'
import { characterCanSeeMessage } from '@/lib/messenger/inbox'
import { cosine, embeddable, embedTexts } from './embeddings'
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
    const candidates = rows.map(({ m, sourceOccurredAt, sourceText, sourceRole }) => ({ ...m, sourceOccurredAt, sourceText, sourceRole, importance: m.importance / 100, persistence: m.persistence / 100, confidence: m.confidence / 100 })) as Array<Memory & { embedding?: number[] | null }>
    await attachSimilarity(candidates, q.query)
    const summary = candidates.find(m => m.type === 'short_term_summary')
    return [...(summary ? [summary] : []), ...retrieveMemories(candidates.filter(m => m.type !== 'short_term_summary'), q.sessionId, limit - (summary ? 1 : 0), q.query)]
  },
}

/**
 * 의미 검색(11/3) — 이번 입력과 기억의 뜻 유사도를 붙인다(retrieveMemories 가 점수에 더한다).
 * 임베딩이 없는 기억은 여기서 한 번에 만들어 저장한다(다음 턴부터는 다시 만들지 않는다). 실패하면 유사도 없이 낱말 검색만.
 */
async function attachSimilarity(candidates: Array<Memory & { embedding?: number[] | null }>, query: string) {
  const text = query.trim()
  if (!text || !embeddable(text) || !candidates.length) return
  const missing = candidates.filter(m => !m.embedding?.length && embeddable(m.content)).slice(0, 40)
  const [queryVec, docVecs] = await Promise.all([embedTexts([text], 'RETRIEVAL_QUERY'), missing.length ? embedTexts(missing.map(m => m.content), 'RETRIEVAL_DOCUMENT') : Promise.resolve([])])
  if (docVecs) {
    missing.forEach((m, i) => { m.embedding = docVecs[i] })
    // 응답을 기다리게 하지 않는다 — 저장이 늦거나 실패하면 다음 턴에 다시 만든다.
    void Promise.all(missing.map((m, i) => db.update(memories).set({ embedding: docVecs[i] }).where(eq(memories.id, m.id)))).catch(() => undefined)
  }
  const q = queryVec?.[0]
  if (!q) return
  for (const m of candidates) if (m.embedding?.length) m.similarity = cosine(q, m.embedding)
}
