import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users, memories, messages, roleplaySessions } from '@miro/db'
import { createRoleplaySession } from '@/lib/simulation/start'
import { memoryRetriever } from '../memory'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const made: string[] = []
afterAll(async () => { if (process.env.DATABASE_URL) for (const id of made) await db.delete(users).where(eq(users.id, id)) })

describeDb('long conversation memory retrieval', () => {
  it('retrieves old sourced preferences and shared-event tags before the 24-candidate cut, with ownership and visibility enforced', async () => {
    const [user, stranger] = await db.insert(users).values([0, 1].map(n => ({ email: `memory-retrieval-${n}-${randomUUID()}@example.test` }))).returning()
    made.push(user!.id, stranger!.id)
    const s = await createRoleplaySession(user!.id, 'thomas')
    const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, s.sessionId))
    const [source] = await db.insert(messages).values({ sessionId: s.sessionId, role: 'user', kind: 'text', content: '완벽하다는 응원보다 문장을 고치는 도움이 편해.', blocks: [], turnIndex: 1 }).returning()
    const base = { sessionId: s.sessionId, characterId: session!.characterId, importance: 65, persistence: 90, confidence: 95, tags: [] as string[], createdAt: new Date('2026-01-01') }
    await db.insert(memories).values([
      { ...base, type: 'preference', sourceMessageId: source!.id, content: '과한 응원은 부담스러워 구체적인 수정 제안을 원한다.' },
      { ...base, type: 'shared_event', content: '글의 첫 문장을 함께 고쳤다.', tags: ['피드백'] },
      { ...base, type: 'short_term_summary', content: '서운함의 원인은 설명 없이 기다리게 한 점이며 다음에는 미리 말하기로 했다.' },
      ...Array.from({ length: 110 }, (_, i) => ({ ...base, type: 'user_fact' as const, content: `관련 없는 사실 ${i}`, importance: 99, persistence: 99, createdAt: new Date('2026-02-01') })),
    ])
    const query = { userId: user!.id, sessionId: s.sessionId, query: '그때 피드백으로 도와준 것', limit: 24 }
    const got = await memoryRetriever.retrieve(query)
    expect(got).toHaveLength(24)
    expect(got.some(m => m.type === 'preference' && m.sourceMessageId === source!.id)).toBe(true)
    expect(got.find(m => m.sourceMessageId === source!.id)?.sourceOccurredAt).toEqual(source!.createdAt)
    expect(got.find(m => m.sourceMessageId === source!.id)?.sourceOccurredAt).not.toEqual(base.createdAt)
    expect(got.some(m => m.type === 'shared_event' && m.tags.includes('피드백'))).toBe(true)
    expect(got[0]!.type).toBe('short_term_summary')
    expect(got.every(m => m.importance <= 1 && m.persistence <= 1 && m.confidence <= 1)).toBe(true)
    expect(await memoryRetriever.retrieve({ ...query, userId: stranger!.id })).toEqual([])
    await db.update(roleplaySessions).set({ restrictedAt: new Date() }).where(eq(roleplaySessions.id, s.sessionId))
    expect(await memoryRetriever.retrieve(query)).toEqual([])
  })
})
