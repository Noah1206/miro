import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db, users, roleplaySessions, relationships, messages, turnUndos } from '@miro/db'
import { createRoleplaySession } from '@/lib/simulation/start'
import { runConversationTurn } from '@/lib/simulation/turn'
import { undoLastTurn } from '@/lib/simulation/reroll'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
beforeEach(() => vi.stubEnv('MIRO_FEATURE_STRICT_CONVERSATION_REVIEW', '0'))
const made: string[] = []
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => { if (process.env.DATABASE_URL) for (const id of made) await db.delete(users).where(eq(users.id, id)) })

async function playedTurn(input: string) {
  vi.stubEnv('AI_PROVIDER', 'mock')
  const [u] = await db.insert(users).values({ email: `reroll-${randomUUID()}@example.test` }).returning()
  made.push(u!.id)
  const { sessionId } = await createRoleplaySession(u!.id, 'thomas')
  const before = (await db.select().from(relationships).where(eq(relationships.sessionId, sessionId)))[0]!
  const turn = await runConversationTurn({ userId: u!.id, sessionId, requestId: randomUUID(), input })
  if (!turn.ok) throw new Error('turn failed')
  return { userId: u!.id, sessionId, before, reply: turn.messages!.find(m => m.role === 'character')! }
}

/** 리롤(10/27): 마지막 장면 턴을 그 턴 전으로 되돌린다. 마지막이 아니거나 남의 대화면 건드리지 않는다. */
describeDb('reroll undo', () => {
  it('restores the state from before the last turn, removes its messages, and only once', async () => {
    const { userId, sessionId, before, reply } = await playedTurn('오늘 소개팅 나갔다 왔어')
    const [undo] = await db.select().from(turnUndos).where(eq(turnUndos.sessionId, sessionId))
    expect(undo).toMatchObject({ turnIndex: 1, input: '오늘 소개팅 나갔다 왔어' })
    expect(undo!.messageIds).toContain(reply.id)

    expect(await undoLastTurn(userId, sessionId, reply.id)).toMatchObject({ ok: true, input: '오늘 소개팅 나갔다 왔어', command: null })
    const after = (await db.select().from(relationships).where(eq(relationships.sessionId, sessionId)))[0]!
    expect({ trust: after.trust, attraction: after.attraction, jealousy: after.jealousy, stage: after.stage })
      .toEqual({ trust: before.trust, attraction: before.attraction, jealousy: before.jealousy, stage: before.stage })
    // 턴이 한 번, 되돌리기가 한 번 올린다 — 그 턴을 읽어 둔 다른 쓰기는 덮지 못한다.
    expect(after.version).toBe(before.version + 2)
    expect((await db.select({ n: roleplaySessions.turnCount }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)))[0]!.n).toBe(0)
    expect(await db.select().from(messages).where(inArray(messages.id, undo!.messageIds))).toEqual([])
    expect(await db.select().from(turnUndos).where(eq(turnUndos.sessionId, sessionId))).toEqual([])
    expect(await undoLastTurn(userId, sessionId, reply.id)).toEqual({ ok: false, reason: 'stale' })
  })

  it('refuses another user, and a reply that something came after', async () => {
    const { userId, sessionId, reply } = await playedTurn('오늘 소개팅 나갔다 왔어')
    expect(await undoLastTurn(randomUUID(), sessionId, reply.id)).toEqual({ ok: false, reason: 'not_found' })
    // 턴 뒤에 캐릭터가 먼저 연락했다 — 그 답은 더는 마지막이 아니다.
    await db.insert(messages).values({ sessionId, role: 'character', kind: 'reality_message', content: '자?', blocks: [], turnIndex: 1 })
    expect(await undoLastTurn(userId, sessionId, reply.id)).toEqual({ ok: false, reason: 'stale' })
    expect((await db.select({ id: messages.id }).from(messages).where(eq(messages.id, reply.id))).length).toBe(1)
  })
})
