import { createHash, randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db, conversationRequests, roleplaySessions, usageLedger } from '@miro/db'
import { rollbackInTransaction } from '@/lib/usage/guard'
import type { ConversationOutcome } from '@/lib/simulation/turn'
import type { AILeaseGuard } from '@miro/providers'

export class SessionUnavailableError extends Error {
  constructor(readonly reason: 'not_found' | 'restricted') { super(reason) }
}

function concurrencyLimit(name: string, fallback: number): number {
  const limit = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error(`invalid ${name}`)
  return limit
}

let pendingLeaseAcquisitions = 0

export const databaseAILeaseGuard: AILeaseGuard = {
  async acquire(provider, workload) {
    const globalLimit = concurrencyLimit('MIRO_AI_GLOBAL_CONCURRENCY', 8)
    const providerLimit = concurrencyLimit('MIRO_AI_PROVIDER_CONCURRENCY', 4)
    if (pendingLeaseAcquisitions >= globalLimit) return null
    pendingLeaseAcquisitions++
    const token = randomUUID()
    let expired = false
    const admission = db.transaction(async tx => {
      if (expired) return false
      await tx.execute(sql`SET LOCAL statement_timeout = '1000ms'`)
      const [lock] = await tx.execute<{ acquired: boolean }>(sql`SELECT pg_try_advisory_xact_lock(hashtext('miro:ai-provider-leases')) AS acquired`)
      if (!lock?.acquired || expired) return false
      await tx.execute(sql`DELETE FROM ai_provider_leases WHERE lease_until <= now()`)
      const [load] = await tx.execute(sql`SELECT count(*)::int AS global_active,
        count(*) FILTER (WHERE provider = ${provider})::int AS provider_active,
        count(*) FILTER (WHERE workload = 'background')::int AS global_background,
        count(*) FILTER (WHERE provider = ${provider} AND workload = 'background')::int AS provider_background
        FROM ai_provider_leases`) as Array<{ global_active: number; provider_active: number; global_background: number; provider_background: number }>
      if (!load || load.global_active >= globalLimit || load.provider_active >= providerLimit
        || (workload === 'background' && (load.global_background >= 1 || load.provider_background >= 1
          || load.global_active >= globalLimit - 1 || load.provider_active >= providerLimit - 1)) || expired) return false
      await tx.execute(sql`INSERT INTO ai_provider_leases (token, provider, workload, lease_until)
        VALUES (${token}::uuid, ${provider}, ${workload}, now() + interval '30 seconds')`)
      return true
    }).finally(() => { pendingLeaseAcquisitions-- })
    const admitted = await new Promise<boolean>((resolve, reject) => {
      const deadline = setTimeout(() => { expired = true; reject(new Error('lease_admission_timeout')) }, 1500)
      void admission.then(value => {
        if (expired) {
          if (value) void db.execute(sql`DELETE FROM ai_provider_leases WHERE token = ${token}::uuid`).catch(() => {})
          return
        }
        clearTimeout(deadline)
        resolve(value)
      }, error => {
        if (expired) return
        clearTimeout(deadline)
        reject(error)
      })
    })
    if (!admitted) return null
    return {
      heartbeat: async () => {
        const renewed = await db.execute(sql`UPDATE ai_provider_leases SET lease_until = now() + interval '30 seconds'
          WHERE token = ${token}::uuid AND lease_until > now() RETURNING token`)
        return renewed.length === 1
      },
      release: async () => { await db.execute(sql`DELETE FROM ai_provider_leases WHERE token = ${token}::uuid`) },
    }
  },
}

export async function reconcileStaleAIReservations(now = new Date()): Promise<number> {
  const stale = await db.execute<{ id: number }>(sql`
    WITH picked AS MATERIALIZED (
      SELECT id FROM ai_usage
      WHERE status = 'reserved' AND created_at < ${new Date(now.getTime() - 60 * 60_000).toISOString()}::timestamptz
      ORDER BY created_at, id LIMIT 100 FOR UPDATE SKIP LOCKED
    )
    UPDATE ai_usage SET status = 'completed', estimated_cost = reserved_cost,
      error = 'interrupted_unknown_usage', ok = false
    FROM picked WHERE ai_usage.id = picked.id RETURNING ai_usage.id
  `)
  return stale.length
}

export async function beginRequest(userId: string, sessionId: string, input: string, requestId: string = randomUUID()) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error('invalid request id')
  const limit = Number(process.env.MIRO_REQUESTS_PER_MINUTE ?? 20)
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid request rate limit')
  const inputHash = createHash('sha256').update(input).digest('hex')
  return db.transaction(async tx => {
    // 트랜잭션 안에서는 문장이 직렬로 왕복한다(실측: 4문장 172ms, 서브쿼리 4개 한 문장 57ms).
    // 잠금 둘은 한 문장으로 — 이 순서로 잡는 곳이 여기뿐이라 교착 위험이 새로 생기지 않는다.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gateway:${userId}`})), pg_advisory_xact_lock(hashtext(${`conversation:${sessionId}`}))`)
    // 소유·이전 요청·분당 횟수·진행 중 여부는 서로 무관한 읽기다 — 한 왕복으로 다 읽고 순서대로 판정한다.
    // (raw sql 의 execute 는 Date 파라미터를 직렬화하지 않는다 — ISO 문자열에 ::timestamptz 를 붙인다.)
    const now = new Date()
    const [row] = await tx.execute(sql`select
      (select json_build_object('id', s.id, 'restricted', s.restricted_at is not null) from ${roleplaySessions} s
        where s.id = ${sessionId} and s.user_id = ${userId} and s.deleted_at is null) as owner,
      (select json_build_object('user_id', r.user_id, 'session_id', r.session_id, 'input_hash', r.input_hash, 'status', r.status, 'result', r.result)
        from ${conversationRequests} r where r.id = ${requestId}) as previous,
      (select count(*)::int from ${conversationRequests} r where r.user_id = ${userId} and r.created_at > ${new Date(now.getTime() - 60_000).toISOString()}::timestamptz) as rate,
      exists(select 1 from ${conversationRequests} r where r.session_id = ${sessionId} and r.status = 'pending' and r.lease_until > ${now.toISOString()}::timestamptz) as busy`) as unknown as Array<{
        owner: { id: string; restricted: boolean } | null
        previous: { user_id: string; session_id: string; input_hash: string; status: string; result: unknown } | null
        rate: number; busy: boolean
      }>
    if (!row?.owner) throw new SessionUnavailableError('not_found')
    if (row.owner.restricted) throw new SessionUnavailableError('restricted')
    const previous = row.previous
    if (previous) {
      if (previous.user_id !== userId || previous.session_id !== sessionId || previous.input_hash !== inputHash) throw new Error('idempotency mismatch')
      if (previous.status === 'completed') return { requestId, cached: previous.result as ConversationOutcome }
      throw new Error('request in progress or interrupted; use a new request id')
    }
    if (row.rate >= limit) throw new Error('request rate limit')
    if (row.busy) throw new Error('conversation busy')
    await tx.insert(conversationRequests).values({ id: requestId, userId, sessionId, inputHash, leaseUntil: new Date(now.getTime() + 15 * 60_000) })
    return { requestId, cached: null }
  })
}
export async function failRequest(requestId: string, expiredBefore?: Date): Promise<boolean> {
  return db.transaction(async tx => {
    // Same lock order as commitTurn: request -> ledger -> usage window.
    const [request] = await tx.select().from(conversationRequests).where(eq(conversationRequests.id, requestId)).for('update')
    if (!request || request.status !== 'pending' || (expiredBefore && request.leaseUntil > expiredBefore)) return false
    const [ledger] = await tx.select({ id: usageLedger.id }).from(usageLedger)
      .where(eq(usageLedger.idempotencyKey, `turn:${requestId}`)).limit(1)
    if (ledger) await rollbackInTransaction(tx, ledger.id)
    await tx.update(conversationRequests).set({ status: 'failed' }).where(eq(conversationRequests.id, requestId))
    return true
  })
}
