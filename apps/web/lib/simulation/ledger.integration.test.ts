import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users, roleplaySessions, stateTransitions } from '@miro/db'
import { createRoleplaySession } from '@/lib/simulation/start'
import { runConversationTurn } from '@/lib/simulation/turn'
import { explainSession, switchSessionPolicy } from '@/lib/ops/transitions'

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

  // §6: 새 세션은 제품 기본값(legacy)으로 시작하고, 전환은 값과 표시만 남긴다. 중단 스위치가 꺼져 있으면 agency:v1 이어도 legacy 로 답하며 관계·대화는 이어진다.
  it('records a policy switch and keeps answering on the legacy path while the kill switch is off', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock'); vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', '')
    const [u] = await db.insert(users).values({ email: `switch-${randomUUID()}@example.test` }).returning()
    made.push(u!.id)
    const { sessionId } = await createRoleplaySession(u!.id, 'thomas')
    expect((await db.select({ v: roleplaySessions.policyVersion }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)))[0]!.v).toBe('legacy:v1')
    expect(await switchSessionPolicy(sessionId, 'agency:v1', 'test cohort')).toBe(true)
    expect(await switchSessionPolicy(sessionId, 'agency:v1', 'again')).toBe(false)
    const first = await runConversationTurn({ userId: u!.id, sessionId, requestId: randomUUID(), input: '오늘 소개팅 나갔다 왔어' })
    expect(first.ok).toBe(true)
    const rows = await explainSession(sessionId)
    expect(rows.find(r => r.field === 'session.policyVersion')).toMatchObject({ rule: 'policy_switch', before: 'legacy:v1', after: 'agency:v1', actor: 'operator' })
    // 스위치가 꺼져 있으니 이 턴은 legacy 다. 원장의 마지막 경로(agency 표시) 와 달라 전환 표시가 한 줄 더 남는다.
    expect(rows.filter(r => r.field === 'session.engine')).toEqual([expect.objectContaining({ before: 'agency', after: 'legacy', rule: 'policy_switch' })])
    expect(rows.some(r => r.field === 'relationship.jealousy' && r.engine === 'legacy')).toBe(true)
  })
})
