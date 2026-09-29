import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, users, memories, memoryJobs, messages, roleplaySessions } from '@miro/db'
import type { analyzeMemory } from '@miro/engine'
import { createRoleplaySession } from '@/lib/simulation/start'
import { loadSession } from '@/lib/simulation/snapshot'
import { runConversationTurn } from '@/lib/simulation/turn'
import { runMemoryJobs } from '../memory-jobs'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const made: string[] = []
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => { if (process.env.DATABASE_URL) for (const id of made) await db.delete(users).where(eq(users.id, id)) })

async function session() {
  const [u] = await db.insert(users).values({ email: `memjob-${randomUUID()}@example.test` }).returning()
  made.push(u!.id)
  return { userId: u!.id, ...(await createRoleplaySession(u!.id, 'thomas')) }
}
/** 합성 추출기 — 모델 품질이 아니라 작업·순서·저장 계약을 본다. 받은 스냅샷을 기록해 입력 범위를 검사한다. */
function analyzer(seen: Array<{ kind: string; input: string; messageAts: string[] }>, answer: (kind: string, input: string) => Array<Record<string, unknown>>): typeof analyzeMemory {
  return async (_llm, kind, input, s) => {
    seen.push({ kind, input, messageAts: s.recentMessages.map(m => m.at ?? '') })
    return { memories: answer(kind, input) as never }
  }
}
const fact = (content: string, extra: Record<string, unknown> = {}) => ({ type: 'user_fact', content, importance: .9, persistence: .9, confidence: 1, tags: [], ...extra })

describeDb('memory jobs (§3.5)', () => {
  it('a turn leaves extraction work in the transaction; the worker stores it and the prompt notes the lag until then', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock'); vi.stubEnv('MIRO_FEATURE_MEMORY_EXTRACTION', '1')
    const s = await session()
    const requestId = randomUUID()
    // 응답 뒤 자동 실행이 작업을 먼저 끝내지 않게 — 여기서는 워커를 직접 돌려 계약을 본다.
    vi.stubEnv('MIRO_MEMORY_JOBS_INLINE', '0')   // 응답 직후 실행을 끄고 워커를 직접 돌린다
    const r = await runConversationTurn({ ...s, requestId, input: '기억해줘 나 커피 좋아해' })
    expect(r.ok).toBe(true)
    const jobs = await db.select().from(memoryJobs).where(eq(memoryJobs.sessionId, s.sessionId))
    expect(jobs.map(j => j.kind)).toEqual(['memory_extraction'])
    expect(jobs[0]!.requestId).toBe(requestId)
    expect(jobs[0]!.throughTurn).toBe(1)
    if (jobs[0]!.status === 'pending') {
      expect((await loadSession(s.sessionId, s.userId))!.snapshot.memoryLag).toBe(true)
    }
    // 응답 안에서 대사 모델이 낸 후보는 저장되지 않았다 — 기억은 작업이 만든다.
    expect(await db.select().from(memories).where(and(eq(memories.sessionId, s.sessionId), eq(memories.type, 'user_fact')))).toHaveLength(0)
    await db.update(memoryJobs).set({ status: 'pending', leaseToken: null, leaseUntil: null }).where(eq(memoryJobs.id, jobs[0]!.id))
    const seen: Array<{ kind: string; input: string; messageAts: string[] }> = []
    const run = await runMemoryJobs(new Date(), { sessionId: s.sessionId, analyze: analyzer(seen, () => [fact('사용자는 커피를 좋아한다')]) })
    expect(run.results).toEqual({ done: 1 })
    expect(seen[0]!.input).toBe('기억해줘 나 커피 좋아해')
    const stored = await db.select().from(memories).where(and(eq(memories.sessionId, s.sessionId), eq(memories.type, 'user_fact')))
    expect(stored.map(m => m.content)).toEqual(['사용자는 커피를 좋아한다'])
    expect(stored[0]!.sourceMessageId).toBe(jobs[0]!.messageId)
    expect((await loadSession(s.sessionId, s.userId))!.snapshot.memoryLag).toBe(false)
  })

  it('runs a session\'s jobs in turn order, feeds each only the conversation up to its own message, and never lets an old summary overwrite a newer one', async () => {
    const s = await session()
    const loaded = (await loadSession(s.sessionId, s.userId))!
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000)
    const [m1, m2] = await db.insert(messages).values([
      { sessionId: s.sessionId, role: 'user', content: '첫 번째 말', blocks: [], turnIndex: 1, createdAt: at(10) },
      { sessionId: s.sessionId, role: 'user', content: '두 번째 말', blocks: [], turnIndex: 2, createdAt: at(5) },
    ]).returning({ id: messages.id })
    const base = { sessionId: s.sessionId, characterId: loaded.characterId, userId: s.userId }
    await db.insert(memoryJobs).values([
      { ...base, messageId: m1!.id, throughTurn: 1, kind: 'memory_summary', createdAt: at(10) },
      { ...base, messageId: m2!.id, throughTurn: 2, kind: 'memory_summary', createdAt: at(5) },
    ])
    const seen: Array<{ kind: string; input: string; messageAts: string[] }> = []
    const summary = (text: string) => [{ type: 'short_term_summary', content: text, importance: .8, persistence: .8, confidence: 1, tags: [] }]
    // 앞선 턴이 끝나야 뒤가 잡힌다 — 한 세션을 지정하면 끝난 뒤 다음 것을 이어서 잡아 한 번에 둘 다 처리한다.
    const run = await runMemoryJobs(new Date(), { sessionId: s.sessionId, limit: 10, analyze: analyzer(seen, (_k, input) => summary(`요약: ${input}`)) })
    expect(run.claimed).toBe(2)
    expect(seen.map(x => x.input)).toEqual(['첫 번째 말', '두 번째 말'])
    expect(seen[0]!.messageAts.every(t => t <= at(10).toISOString())).toBe(true)   // 두 번째 말은 첫 작업의 입력에 없다
    const stored = await db.select().from(memories).where(and(eq(memories.sessionId, s.sessionId), eq(memories.type, 'short_term_summary')))
    expect(stored.map(m => m.content)).toEqual(['요약: 두 번째 말'])

    // 옛 요약 작업이 임대 만료로 다시 살아나도 최신 요약을 덮지 않는다.
    await db.update(memoryJobs).set({ status: 'pending', finishedAt: null }).where(and(eq(memoryJobs.sessionId, s.sessionId), eq(memoryJobs.throughTurn, 1)))
    const replay = await runMemoryJobs(new Date(), { sessionId: s.sessionId, limit: 10, analyze: analyzer(seen, () => summary('옛 결과')) })
    expect(replay.results).toEqual({ superseded: 1 })
    expect((await db.select().from(memories).where(and(eq(memories.sessionId, s.sessionId), eq(memories.type, 'short_term_summary')))).map(m => m.content)).toEqual(['요약: 두 번째 말'])
  })

  it('a failing summary does not hold back later extraction, but a later summary still waits for it', async () => {
    const s = await session()
    const loaded = (await loadSession(s.sessionId, s.userId))!
    const [m1, m2] = await db.insert(messages).values([
      { sessionId: s.sessionId, role: 'user', content: '열두 번째 말', blocks: [], turnIndex: 12 },
      { sessionId: s.sessionId, role: 'user', content: '나 이제 녹차만 마셔', blocks: [], turnIndex: 13 },
    ]).returning({ id: messages.id })
    const base = { sessionId: s.sessionId, characterId: loaded.characterId, userId: s.userId }
    await db.insert(memoryJobs).values([
      { ...base, messageId: m1!.id, throughTurn: 12, kind: 'memory_summary' },
      { ...base, messageId: m2!.id, throughTurn: 13, kind: 'memory_extraction' },
      { ...base, messageId: m2!.id, throughTurn: 13, kind: 'memory_summary' },
    ])
    const seen: Array<{ kind: string; input: string; messageAts: string[] }> = []
    const analyze: typeof analyzeMemory = async (llm, kind, input, snap) => {
      if (kind === 'memory_summary') throw new Error('provider_error')
      return analyzer(seen, () => [fact('사용자는 녹차만 마신다')])(llm, kind, input, snap)
    }
    const run = await runMemoryJobs(new Date(), { sessionId: s.sessionId, limit: 10, analyze })
    expect(run.results).toEqual({ retry: 1, done: 1 })   // 요약 실패 → 재시도 대기, 뒤의 추출은 끝남, 뒤의 요약은 대기
    const rows = await db.select({ kind: memoryJobs.kind, through: memoryJobs.throughTurn, status: memoryJobs.status }).from(memoryJobs).where(eq(memoryJobs.sessionId, s.sessionId))
    expect(rows.find(r => r.kind === 'memory_extraction')!.status).toBe('done')
    expect(rows.filter(r => r.kind === 'memory_summary').map(r => [r.through, r.status]).sort()).toEqual([[12, 'pending'], [13, 'pending']])
  })

  it('cancels work for a deleted session without calling the model, and retries a failed analysis with a bounded count', async () => {
    const s = await session()
    const loaded = (await loadSession(s.sessionId, s.userId))!
    const [m] = await db.insert(messages).values({ sessionId: s.sessionId, role: 'user', content: '비밀 하나 말해줄게', blocks: [], turnIndex: 1 }).returning({ id: messages.id })
    const [job] = await db.insert(memoryJobs).values({ sessionId: s.sessionId, characterId: loaded.characterId, userId: s.userId, messageId: m!.id, throughTurn: 1, kind: 'memory_extraction' }).returning()
    let calls = 0
    const failing: typeof analyzeMemory = async () => { calls++; throw new Error('provider_error') }
    expect((await runMemoryJobs(new Date(), { sessionId: s.sessionId, analyze: failing })).results).toEqual({ retry: 1 })
    const [after] = await db.select().from(memoryJobs).where(eq(memoryJobs.id, job!.id))
    expect(after!.status).toBe('pending'); expect(after!.attempts).toBe(1); expect(after!.errorCode).toBe('provider_error')
    await db.update(roleplaySessions).set({ deletedAt: new Date() }).where(eq(roleplaySessions.id, s.sessionId))
    await db.update(memoryJobs).set({ nextAttemptAt: new Date(0) }).where(eq(memoryJobs.id, job!.id))
    expect((await runMemoryJobs(new Date(), { sessionId: s.sessionId, analyze: failing })).results).toEqual({ cancelled: 1 })
    expect(calls).toBe(1)
    expect(await db.select().from(memories).where(eq(memories.sessionId, s.sessionId))).toHaveLength(0)
  })
})
