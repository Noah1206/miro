import { randomUUID } from 'node:crypto'
import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { db, memories, memoryJobs, messages, roleplaySessions, users } from '@miro/db'
import { POLICY } from '@miro/config'
import { dedupeCandidates, filterSalient, pruneMemories, tagsOf } from '@miro/domain'
import { analyzeMemory, planTasks } from '@miro/engine'
import type { AITask } from '@miro/providers'
import type { UsageTransaction } from '@/lib/usage/guard'
import { loadSession } from '@/lib/simulation/snapshot'
import { conversationContext } from '@/lib/simulation/character-context'
import { auxiliaryLLM } from '@/lib/simulation/mock-llm'
import { observe } from '@/lib/observe'

type Kind = 'memory_extraction' | 'memory_summary'
const KINDS: readonly AITask[] = ['memory_extraction', 'memory_summary']
const LEASE_MS = 120_000
const MAX_ATTEMPTS = 3

/**
 * 커밋 트랜잭션 안에서 부른다(§3.5). 어떤 작업을 남길지는 응답 안에서 돌리던 것과 같은 규칙(planTasks)이 정한다 —
 * 배포가 끈 기능은 여기서도 살아나지 않는다. 메시지·턴·종류로 식별해 같은 턴을 두 번 추출하지 않는다.
 */
export async function enqueueMemoryJobs(tx: UsageTransaction, job: {
  sessionId: string; characterId: string; userId: string; requestId?: string; messageId: string; turnIndex: number; input: string; auxiliary: 'planned' | 'always'
}): Promise<Kind[]> {
  const kinds = planTasks(job.input, job.turnIndex, job.auxiliary).filter((t): t is Kind => KINDS.includes(t))
  if (kinds.length) await tx.insert(memoryJobs).values(kinds.map(kind => ({
    sessionId: job.sessionId, characterId: job.characterId, userId: job.userId, requestId: job.requestId ?? null,
    messageId: job.messageId, throughTurn: job.turnIndex, kind,
  }))).onConflictDoNothing()
  return kinds
}

/** 대기 중인 작업이 있으면 그 세션의 기억은 최신이 아니다 — 프롬프트가 옛 기억을 확정 사실로 내밀지 않게. */
export async function memoryLagFor(sessionId: string): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(memoryJobs)
    .where(and(eq(memoryJobs.sessionId, sessionId), inArray(memoryJobs.status, ['pending', 'running'])))
  return (row?.n ?? 0) > 0
}

export type MemoryJobRun = { claimed: number; results: Record<string, number> }

/**
 * 워커. 임대·재시도·만료 회수는 푸시 outbox 와 같은 꼴이지만 표는 따로다(범용 큐를 만들지 않는다).
 * 한 세션 안에서는 앞선 턴의 작업이 끝나야 뒤 작업을 잡는다 — 요약이 옛 결과에 덮이지 않는다.
 * 커밋 직후(afterResponse)에 그 세션 것만, 크론에서는 전부.
 */
export async function runMemoryJobs(now = new Date(), opts: { limit?: number; sessionId?: string; analyze?: typeof analyzeMemory; inline?: boolean } = {}): Promise<MemoryJobRun> {
  // 응답 직후 실행을 끄는 스위치(운영·테스트). 크론 sweep 은 inline 이 아니다.
  if (opts.inline && process.env.MIRO_MEMORY_JOBS_INLINE === '0') return { claimed: 0, results: {} }
  const limit = Math.min(50, Math.max(1, opts.limit ?? 10))
  const token = randomUUID()
  const results: Record<string, number> = {}
  const count = (k: string) => { results[k] = (results[k] ?? 0) + 1 }
  let claimed = 0
  // 세션 안 순서 때문에 한 번의 claim 은 세션당 첫 작업만 돌려준다 — 끝나면 같은 세션의 다음 것을 다시 잡는다(limit 까지).
  for (let round = 0; round < limit && claimed < limit; round++) {
    // 시각은 DB 가 정한다: next_attempt_at 은 DB now()(µs) 라 앱 시각(ms, 다른 호스트)과 비교하면 방금 만든 작업을 놓친다.
    const batch = await db.execute<{ id: string }>(sql`
      UPDATE memory_jobs SET status = 'running', lease_token = ${token}::uuid,
        lease_until = now() + make_interval(secs => ${LEASE_MS / 1000}), attempts = attempts + 1
      WHERE id IN (
        SELECT m.id FROM memory_jobs m
        WHERE ((m.status = 'pending' AND m.next_attempt_at <= now())
            OR (m.status = 'running' AND m.lease_until <= now()))
          AND m.attempts < ${MAX_ATTEMPTS}
          AND (${opts.sessionId ?? null}::uuid IS NULL OR m.session_id = ${opts.sessionId ?? null}::uuid)
          -- 세션 안 순서: 추출은 앞선 추출을(정정·교체가 순서대로), 요약은 앞선 모든 작업을 기다린다(범위를 빠뜨린 채 끝나지 않게).
          -- 실패 중인 요약이 뒤의 추출을 막지는 않는다.
          AND NOT EXISTS (
            SELECT 1 FROM memory_jobs o WHERE o.session_id = m.session_id AND o.id <> m.id AND o.status IN ('pending', 'running')
              AND (m.kind = 'memory_summary' OR o.kind = 'memory_extraction')
              AND (o.through_turn < m.through_turn OR (o.through_turn = m.through_turn AND o.created_at < m.created_at)))
        ORDER BY m.through_turn, m.created_at LIMIT ${limit - claimed} FOR UPDATE SKIP LOCKED
      ) RETURNING id
    `)
    if (!batch.length) break
    claimed += batch.length
    for (const { id } of batch) count(await runOne(id, token, now, opts.analyze ?? analyzeMemory))
    // 특정 세션이 아니면 한 바퀴로 끝낸다 — 크론은 다음 주기에 이어 간다.
    if (!opts.sessionId) break
  }
  // 임대가 만료된 채 3회를 다 쓴 작업은 다시 잡히지 않는다 — 실패로 닫아 뒤 작업을 막지 않게.
  await db.update(memoryJobs).set({ status: 'failed', errorCode: 'attempts_exhausted', leaseToken: null, leaseUntil: null, finishedAt: now })
    .where(and(eq(memoryJobs.status, 'running'), sql`${memoryJobs.leaseUntil} <= now()`, sql`${memoryJobs.attempts} >= ${MAX_ATTEMPTS}`))
  return { claimed, results }
}

async function runOne(id: string, token: string, now: Date, analyze: typeof analyzeMemory) {
  const [job] = await db.select().from(memoryJobs).where(and(eq(memoryJobs.id, id), eq(memoryJobs.leaseToken, token))).limit(1)
  if (!job) return 'lost'
  const finish = (status: typeof job.status, errorCode: string | null = null) => db.update(memoryJobs).set({
    status, errorCode, leaseToken: null, leaseUntil: null, finishedAt: ['done', 'failed', 'cancelled', 'superseded'].includes(status) ? now : null,
    nextAttemptAt: new Date(now.getTime() + Math.min(3600_000, 60_000 * 2 ** Math.min(job.attempts, 6))),
  }).where(and(eq(memoryJobs.id, id), eq(memoryJobs.leaseToken, token)))
  const retryOrFail = (code: string) => finish(job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', code)
  // 어느 단계에서 던지든 재시도 횟수 안에서 끝난다 — 무한히 다시 잡혀 매번 모델을 부르며 세션의 뒤 작업을 막지 않게.
  try { return await processJob(job, id, token, now, analyze, finish, retryOrFail) }
  catch (e) {
    observe('memory.job_failed', { jobId: id, error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' })
    await retryOrFail(e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : 'job_error').catch(() => undefined)
    return 'retry'
  }
}

async function processJob(job: typeof memoryJobs.$inferSelect, id: string, token: string, now: Date, analyze: typeof analyzeMemory,
  finish: (status: typeof job.status, errorCode?: string | null) => Promise<unknown>, retryOrFail: (code: string) => Promise<unknown>) {

  // 삭제·제한 뒤에는 결과를 남기지 않는다. 원문이 숨겨졌으면(운영 조치) 그 턴도 기억이 되지 않는다.
  const [state] = await db.select({ deletedAt: roleplaySessions.deletedAt, restrictedAt: roleplaySessions.restrictedAt, status: roleplaySessions.status, userDeleted: users.deletedAt })
    .from(roleplaySessions).innerJoin(users, eq(users.id, roleplaySessions.userId)).where(and(eq(roleplaySessions.id, job.sessionId), eq(roleplaySessions.userId, job.userId))).limit(1)
  const [source] = await db.select({ content: messages.content, createdAt: messages.createdAt, hiddenAt: messages.hiddenAt }).from(messages)
    .where(and(eq(messages.id, job.messageId), eq(messages.sessionId, job.sessionId))).limit(1)
  if (!state || state.deletedAt || state.restrictedAt || state.status !== 'active' || state.userDeleted || !source || source.hiddenAt) { await finish('cancelled', 'session_unavailable'); return 'cancelled' }
  // 더 최신 턴의 요약이 이미 끝났으면 이 요약은 옛 결과다 — 최신을 덮지 않는다.
  if (job.kind === 'memory_summary') {
    const [newer] = await db.select({ id: memoryJobs.id }).from(memoryJobs)
      .where(and(eq(memoryJobs.sessionId, job.sessionId), eq(memoryJobs.kind, 'memory_summary'), eq(memoryJobs.status, 'done'), gt(memoryJobs.throughTurn, job.throughTurn))).limit(1)
    if (newer) { await finish('superseded'); return 'superseded' }
  }

  const loaded = await loadSession(job.sessionId, job.userId, source.content)
  if (!loaded) { await finish('cancelled', 'session_unavailable'); return 'cancelled' }
  // 재시도가 미래 메시지를 입력에 섞지 않는다 — 원인 메시지까지의 대화를 따로 읽는다(스냅샷의 최신 24개를 거르면 늦은 작업은 빈 창을 본다).
  const window = await db.select().from(messages)
    .where(and(eq(messages.sessionId, job.sessionId), isNull(messages.hiddenAt), inArray(messages.role, ['user', 'character', 'narrator', 'npc']),
      or(sql`${messages.turnIndex} < ${job.throughTurn}`, lte(messages.createdAt, source.createdAt))))
    .orderBy(desc(messages.turnIndex), desc(messages.createdAt), desc(messages.id)).limit(24)
  const recentMessages = conversationContext(window.reverse(), loaded.snapshot.clock?.timeZone)
  // 요약은 그 범위의 대화가 있어야 뜻이 있다 — 비어 있으면 옛 요약을 빈 것으로 덮지 않고 나중에 다시 본다.
  if (job.kind === 'memory_summary' && !recentMessages.length) { await retryOrFail('summary_window_empty'); return 'retry' }
  const snapshot = { ...loaded.snapshot, recentMessages, turnCount: job.throughTurn }
  const llm = auxiliaryLLM(loaded.characterName, { userId: job.userId, sessionId: job.sessionId, requestId: job.requestId ?? job.id, workload: 'background', origin: `memory:${job.kind}`, adult: loaded.adult.since !== null })
  let candidates
  try { candidates = filterSalient((await analyze(llm, job.kind, source.content, snapshot)).memories) }
  catch (e) { await retryOrFail(e instanceof Error ? e.message.slice(0, 60) : 'analyze_failed'); return 'retry' }

  await db.transaction(async tx => {
    // 결과 저장과 작업 완료는 한 트랜잭션 — 둘 중 하나만 남지 않는다. 호출 비용까지 정확히 한 번이라고는 주장하지 않는다.
    const [locked] = await tx.select({ id: memoryJobs.id }).from(memoryJobs).where(and(eq(memoryJobs.id, id), eq(memoryJobs.leaseToken, token))).for('update')
    if (!locked) return
    const existing = await tx.select().from(memories).where(eq(memories.sessionId, job.sessionId))
    const asMemory = existing.map(m => ({ ...m, importance: m.importance / 100, persistence: m.persistence / 100, confidence: m.confidence / 100 }))
    const replacements = candidates.filter(m => m.replaces && existing.some(old => old.id === m.replaces && old.type === m.type)).map(m => m.replaces!)
    const fresh = dedupeCandidates(candidates.filter(m => !m.replaces || replacements.includes(m.replaces)), asMemory.filter(m => !replacements.includes(m.id)) as never)
    if (fresh.length) {
      const accepted = fresh.flatMap(m => m.replaces ? [m.replaces] : [])
      if (accepted.length) await tx.delete(memories).where(and(eq(memories.sessionId, job.sessionId), inArray(memories.id, accepted)))
      if (fresh.some(m => m.type === 'short_term_summary')) await tx.delete(memories).where(and(eq(memories.sessionId, job.sessionId), eq(memories.type, 'short_term_summary')))
      await tx.insert(memories).values(fresh.map(m => ({
        sessionId: job.sessionId, characterId: job.characterId, sourceMessageId: job.messageId, type: m.type, content: m.content,
        importance: Math.round(m.importance * 100), persistence: Math.round(m.persistence * 100), confidence: Math.round(m.confidence * 100),
        tags: tagsOf({ content: m.content, tags: m.tags ?? [] }),
      })))
      const all = await tx.select().from(memories).where(eq(memories.sessionId, job.sessionId))
      for (const m of pruneMemories(all as never, POLICY.memory.maxPerSession).drop) await tx.delete(memories).where(eq(memories.id, m.id))
    }
    // 완료 시각은 실제로 끝난 때 — 워커가 시작할 때 받은 now 가 아니다(지연 측정이 틀렸다).
    await tx.update(memoryJobs).set({ status: 'done', leaseToken: null, leaseUntil: null, finishedAt: sql`now()`, errorCode: null })
      .where(and(eq(memoryJobs.id, id), eq(memoryJobs.leaseToken, token)))
  })
  observe('memory.job_done', { jobId: id, kind: job.kind, stored: candidates.length })
  return 'done'
}
