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
import { usageStatus } from '@/lib/usage/guard'
import { startOutgoingCall } from '@/lib/call/service'
import { memoryRetriever } from '../memory'

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
    vi.stubEnv('AI_PROVIDER', 'mock'); vi.stubEnv('MIRO_MODEL_REGISTRY', '')
    const s = await session(), requestId = randomUUID()
    const before = await loadSession(s.sessionId, s.userId)
    const broken = new AIOrchestrator({ chain: [new MockAIProvider(() => { throw new Error('offline') })], maxRetries: 0 })
    vi.spyOn(llms, 'resolveRpLLM').mockReturnValue(broken)
    expect(await runConversationTurn({ ...s, requestId, input: '사랑해' })).toMatchObject({ ok: false, reason: 'generation' })
    expect((await usageStatus(s.userId)).consumed).toBe(0)
    const after = await loadSession(s.sessionId, s.userId)
    expect(after!.snapshot.relationship).toEqual(before!.snapshot.relationship)
    expect(after!.snapshot.turnCount).toBe(before!.snapshot.turnCount)
    const [ledger] = await db.select().from(usageLedger).where(eq(usageLedger.idempotencyKey, `turn:${requestId}`))
    expect(ledger!.status).toBe('rolled_back')
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
