import { createHash, randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db, conversationRequests, roleplaySessions, usageLedger } from '@miro/db'
import { rollbackInTransaction } from '@/lib/usage/guard'
import type { ConversationOutcome } from '@/lib/simulation/turn'

export class SessionUnavailableError extends Error {
  constructor(readonly reason: 'not_found' | 'restricted') { super(reason) }
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
