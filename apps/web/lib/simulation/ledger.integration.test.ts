import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users, stateTransitions } from '@miro/db'
import { createRoleplaySession } from '@/lib/simulation/start'
import { runConversationTurn } from '@/lib/simulation/turn'
import { explainSession } from '@/lib/ops/transitions'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const made: string[] = []
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => { if (process.env.DATABASE_URL) for (const id of made) await db.delete(users).where(eq(users.id, id)) })

/** §3.4: 원장은 응답 트랜잭션 안에 남고, 같은 요청의 재전송은 효과를 두 번 남기지 않는다. */
describeDb('state transition ledger', () => {
  it('writes the turn\'s relationship change with its request, cause message and versions; a resend adds nothing', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock')
    const [u] = await db.insert(users).values({ email: `ledger-${randomUUID()}@example.test` }).returning()
    made.push(u!.id)
    const { sessionId } = await createRoleplaySession(u!.id, 'thomas')
    const requestId = randomUUID()
    const first = await runConversationTurn({ userId: u!.id, sessionId, requestId, input: '오늘 소개팅 나갔다 왔어' })
    expect(first.ok).toBe(true)
    const rows = await db.select().from(stateTransitions).where(eq(stateTransitions.sessionId, sessionId))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => r.triggerKey === `chat:${requestId}` && r.policyVersion === 'turn-policy:v1' && r.engine === 'legacy')).toBe(true)
    const jealousy = rows.find(r => r.field === 'relationship.jealousy')!
    expect(jealousy.rule).toBe('relationship_rules')
    expect(jealousy.status).toBe('applied')
    expect(jealousy.causeMessageId).toBeTruthy()
    expect(jealousy.relationshipVersion).toBe(2)
    expect(jealousy.worldVersion).toBe(2)
    // 원장에는 대화 원문이 없다.
    expect(rows.some(r => JSON.stringify([r.before, r.after]).includes('소개팅'))).toBe(false)

    const again = await runConversationTurn({ userId: u!.id, sessionId, requestId, input: '오늘 소개팅 나갔다 왔어' })
    expect(again.ok).toBe(true)
    expect((await db.select().from(stateTransitions).where(eq(stateTransitions.sessionId, sessionId))).length).toBe(rows.length)

    const explained = await explainSession(sessionId, { field: 'relationship' })
    expect(explained.every(r => r.field.startsWith('relationship.'))).toBe(true)
    expect(explained[0]!.trigger).toBe(`chat:${requestId}`)
  })
})
