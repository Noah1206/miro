import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users, messages, memories, roleplaySessions, usageLedger } from '@miro/db'
import { AIOrchestrator, MockAIProvider } from '@miro/providers'
import { runTurn, buildMockProposal } from '@miro/engine'
import { createRoleplaySession } from '@/lib/simulation/start'
import { loadSession } from '@/lib/simulation/snapshot'
import { commitTurn } from '@/lib/simulation/commit'
import { runConversationTurn } from '@/lib/simulation/turn'
import * as llms from '@/lib/simulation/mock-llm'
import { reserve, usageStatus } from '@/lib/usage/guard'
import { startOutgoingCall } from '@/lib/call/service'
import { memoryRetriever } from '../memory'
import { POLICY } from '@miro/config'
import { installAIUsageSink } from '@/lib/usage/ai-usage'
import { COPY } from '@/lib/copy'

/** A premium model must exist for ECHO to resolve at all. */
const ECHO_REGISTRY = [
  { id: 'basic', provider: 'mock', providerModelId: 'basic', tier: 'small', capabilities: ['dialogue'], maxContextTokens: 32768 },
  { id: 'advanced', provider: 'mock', providerModelId: 'advanced', tier: 'premium', capabilities: ['dialogue'], maxContextTokens: 32768 },
]

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const made: string[] = []
async function session() {
  const [u] = await db.insert(users).values({ email: `p0-${randomUUID()}@example.test` }).returning()
  made.push(u!.id)
  return { userId: u!.id, ...(await createRoleplaySession(u!.id, 'thomas')) }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
afterAll(async () => { if (process.env.DATABASE_URL) for (const id of made) await db.delete(users).where(eq(users.id, id)) })
describeDb('P0 real persistence paths', () => {
  it('rolls back the monthly charge and does not save a fallback or relationship change', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock')
    vi.stubEnv('MIRO_MODEL_REGISTRY', JSON.stringify(ECHO_REGISTRY))
    const s = await session(), requestId = randomUUID()
    await db.update(users).set({ plan: 'pro' }).where(eq(users.id, s.userId))
    const before = await loadSession(s.sessionId, s.userId)
    const broken = new AIOrchestrator({ chain: [new MockAIProvider(() => { throw new Error('offline') })], maxRetries: 0 })
    vi.spyOn(llms, 'resolveRpLLM').mockReturnValue(broken)
    // ECHO is the metered model — only it produces a ledger row to roll back.
    expect(await runConversationTurn({ ...s, requestId, input: '사랑해', chatModel: 'pro' })).toMatchObject({ ok: false, reason: 'generation' })
    expect((await usageStatus(s.userId)).consumed).toBe(0)
    const after = await loadSession(s.sessionId, s.userId)
    expect(after!.snapshot.relationship).toEqual(before!.snapshot.relationship)
    expect(after!.snapshot.turnCount).toBe(before!.snapshot.turnCount)
    const [ledger] = await db.select().from(usageLedger).where(eq(usageLedger.idempotencyKey, `turn:${requestId}`))
    expect(ledger!.status).toBe('rolled_back')
  })

  it('MIRO basic chat is never charged, even with the monthly allowance spent', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock'); vi.stubEnv('MIRO_MODEL_REGISTRY', '')
    const s = await session()
    // Spend the whole monthly allowance, then keep talking on MIRO.
    await reserve({ userId: s.userId, kind: 'photo', units: POLICY.usage.limits.free / POLICY.usage.weights.photo, idempotencyKey: `drain:${s.userId}` })
    const spent = (await usageStatus(s.userId)).consumed
    expect(spent).toBe(POLICY.usage.limits.free)

    const r = await runConversationTurn({ ...s, requestId: randomUUID(), input: '오늘 뭐 했어?' })
    expect(r.ok).toBe(true)
    // No user allowance was drawn, and no ledger row was written for the turn.
    expect((await usageStatus(s.userId)).consumed).toBe(spent)
    const rows = await db.select().from(usageLedger).where(eq(usageLedger.userId, s.userId))
    expect(rows.map(r => r.kind)).toEqual(['photo'])
  })

  it('replaying an ECHO turn charges the allowance once', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock')
    vi.stubEnv('MIRO_MODEL_REGISTRY', JSON.stringify(ECHO_REGISTRY))
    const s = await session(), requestId = randomUUID()
    await db.update(users).set({ plan: 'pro' }).where(eq(users.id, s.userId))
    const first = await runConversationTurn({ ...s, requestId, input: '잘 지냈어?', chatModel: 'pro' })
    expect(first.ok).toBe(true)
    const charged = (await usageStatus(s.userId)).consumed
    expect(charged).toBeGreaterThan(0)
    expect(await runConversationTurn({ ...s, requestId, input: '잘 지냈어?', chatModel: 'pro' })).toEqual(first)
    expect((await usageStatus(s.userId)).consumed).toBe(charged)
    const rows = await db.select().from(usageLedger).where(eq(usageLedger.idempotencyKey, `turn:${requestId}`))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('committed')
  })

  it('ECHO is still blocked once the allowance is spent', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock')
    vi.stubEnv('MIRO_MODEL_REGISTRY', JSON.stringify(ECHO_REGISTRY))
    const s = await session()
    await db.update(users).set({ plan: 'pro' }).where(eq(users.id, s.userId))
    await reserve({ userId: s.userId, kind: 'photo', units: POLICY.usage.limits.pro / POLICY.usage.weights.photo, idempotencyKey: `drain-pro:${s.userId}` })
    const r = await runConversationTurn({ ...s, requestId: randomUUID(), input: '보고 싶었어', chatModel: 'pro' })
    expect(r).toMatchObject({ ok: false, reason: 'usage' })
  })
  it('a monthly abuse ceiling stops free chat and says so without promising tomorrow', async () => {
    // mock 은 원가가 항상 0 이라 원가 상한에 걸릴 수 없다 — 요청 수 상한으로 막는 걸 본다.
    vi.stubEnv('AI_PROVIDER', 'mock'); vi.stubEnv('MIRO_MODEL_REGISTRY', '')
    vi.stubEnv('AI_DAILY_BUDGET', '1000'); vi.stubEnv('AI_USER_MONTHLY_LIMIT', '0')
    installAIUsageSink()
    const s = await session()
    const r = await runConversationTurn({ ...s, requestId: randomUUID(), input: '한 마디 더.' })
    // 무료 대화라도 월간 상한에는 걸린다 — 사용량(usage)이 아니라 예산(budget)으로.
    expect(r).toMatchObject({ ok: false, reason: 'budget', kind: 'user_monthly' })
    expect(COPY.error.budgetMonthly).toContain('다음 달')
    expect(COPY.error.budgetMonthly).not.toContain('내일')
  })

  it('denies cross-user and restricted calls before charging', async () => {
    const owner = await session(), other = await session()
    await expect(startOutgoingCall(other.userId, owner.sessionId, 'voice')).rejects.toThrow('SESSION_NOT_FOUND')
    await db.update(roleplaySessions).set({ restrictedAt: new Date() }).where(eq(roleplaySessions.id, owner.sessionId))
    await expect(startOutgoingCall(owner.userId, owner.sessionId, 'voice')).rejects.toThrow('SESSION_NOT_FOUND')
    expect((await usageStatus(other.userId)).consumed).toBe(0)
    expect((await usageStatus(owner.userId)).consumed).toBe(0)
  })
  it('replaces summaries and corrected facts atomically without touching another session', async () => {
    const s = await session(), other = await session()
    const loaded = (await loadSession(s.sessionId, s.userId))!
    const [old, summary] = await db.insert(memories).values([
      { sessionId: s.sessionId, characterId: loaded.characterId, type: 'preference', content: '커피를 좋아한다', importance: 90, persistence: 90, confidence: 100 },
      { sessionId: s.sessionId, characterId: loaded.characterId, type: 'short_term_summary', content: '옛 요약', importance: 90, persistence: 90, confidence: 100 },
    ]).returning()
    const [foreign] = await db.insert(memories).values({ sessionId: other.sessionId, characterId: loaded.characterId, type: 'preference', content: '다른 사람의 기억', importance: 90, persistence: 90, confidence: 100 }).returning()
    const current = (await loadSession(s.sessionId, s.userId))!
    const ai = new AIOrchestrator({ chain: [new MockAIProvider(req => buildMockProposal(req.prompt, { characterName: '토마스' }))] })
    const turn = await runTurn({ llm: ai, snapshot: current.snapshot, userInput: '정정할게. 이제 차를 좋아해.' })
    turn.transition.memories = [
      { type: 'preference', content: '차를 좋아한다', importance: .9, persistence: .9, confidence: 1, replaces: old!.id },
      { type: 'short_term_summary', content: '새 요약', importance: .9, persistence: .9, confidence: 1 },
      { type: 'preference', content: '다른 세션을 덮어쓰려 함', importance: .9, persistence: .9, confidence: 1, replaces: foreign!.id },
    ]
    await commitTurn({ sessionId: s.sessionId, characterId: current.characterId, turnIndex: current.snapshot.turnCount + 1,
      userInput: '정정할게', responseText: '기억할게요', blocks: turn.transition.blocks, transition: turn.transition,
      worldVersion: current.snapshot.world.version, relationshipVersion: current.snapshot.relationship.version,
      currentRelationship: current.snapshot.relationship, existingMemories: current.snapshot.memories })
    const own = await db.select().from(memories).where(eq(memories.sessionId, s.sessionId))
    expect(own.map(m => m.content).sort()).toEqual(['새 요약', '차를 좋아한다'])
    expect(own.some(m => m.id === summary!.id)).toBe(false)
    expect(await db.select().from(memories).where(eq(memories.id, foreign!.id))).toHaveLength(1)
    expect((await memoryRetriever.retrieve({ sessionId: s.sessionId, userId: s.userId, query: 'unrelated', limit: 1 }))[0]!.content).toBe('새 요약')
  })
  it.each(['deletedAt', 'restrictedAt'] as const)('rejects a turn when %s changes during generation', async (field) => {
    const s = await session()
    const current = (await loadSession(s.sessionId, s.userId))!
    const ai = new AIOrchestrator({ chain: [new MockAIProvider(req => buildMockProposal(req.prompt, { characterName: '토마스' }))] })
    const turn = await runTurn({ llm: ai, snapshot: current.snapshot, userInput: '안녕' })
    await db.update(roleplaySessions).set({ [field]: new Date() }).where(eq(roleplaySessions.id, s.sessionId))
    await expect(commitTurn({ sessionId: s.sessionId, characterId: current.characterId, turnIndex: current.snapshot.turnCount + 1,
      userInput: '안녕', responseText: '안녕', blocks: turn.transition.blocks, transition: turn.transition,
      worldVersion: current.snapshot.world.version, relationshipVersion: current.snapshot.relationship.version,
      currentRelationship: current.snapshot.relationship, existingMemories: current.snapshot.memories })).rejects.toThrow('simulation state changed')
    expect(await db.select().from(messages).where(eq(messages.sessionId, s.sessionId))).toHaveLength(0)
  })
  it('does not reintroduce hidden messages to model context', async () => {
    const s = await session()
    await db.insert(messages).values({ sessionId: s.sessionId, role: 'user', content: 'HIDDEN_PRIVATE_TEXT', turnIndex: 1, hiddenAt: new Date() })
    const loaded = await loadSession(s.sessionId, s.userId)
    expect(JSON.stringify(loaded!.snapshot.recentMessages)).not.toContain('HIDDEN_PRIVATE_TEXT')
  })
})
