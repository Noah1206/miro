import { createHash, randomUUID } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db, conversationRequests, roleplaySessions, usageLedger } from '@miro/db'
import { rollbackInTransaction } from '@/lib/usage/guard'
import type { ConversationOutcome } from '@/lib/simulation/turn'

export class SessionUnavailableError extends Error {
  constructor(readonly reason: 'not_found' | 'restricted') { super(reason) }
}

export async function beginRequest(userId: string, sessionId: string, input: string, requestId: string = randomUUID()) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error('invalid request id')
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gateway:${userId}`}))`)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`conversation:${sessionId}`}))`)
    const [owner] = await tx.select({ id: roleplaySessions.id, restrictedAt: roleplaySessions.restrictedAt }).from(roleplaySessions).where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt))).limit(1)
    if (!owner) throw new SessionUnavailableError('not_found')
    if (owner.restrictedAt) throw new SessionUnavailableError('restricted')
    const inputHash = createHash('sha256').update(input).digest('hex')
    const [previous] = await tx.select().from(conversationRequests).where(eq(conversationRequests.id, requestId)).limit(1)
    if (previous) {
      if (previous.userId !== userId || previous.sessionId !== sessionId || previous.inputHash !== inputHash) throw new Error('idempotency mismatch')
      if (previous.status === 'completed') return { requestId, cached: previous.result as ConversationOutcome }
      throw new Error('request in progress or interrupted; use a new request id')
    }
    const limit = Number(process.env.MIRO_REQUESTS_PER_MINUTE ?? 20)
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid request rate limit')
    const [rate] = await tx.select({ n: sql<number>`count(*)::int` }).from(conversationRequests).where(and(eq(conversationRequests.userId, userId), gt(conversationRequests.createdAt, new Date(Date.now() - 60_000))))
    if ((rate?.n ?? 0) >= limit) throw new Error('request rate limit')
    const [busy] = await tx.select({ id: conversationRequests.id }).from(conversationRequests).where(and(eq(conversationRequests.sessionId, sessionId), eq(conversationRequests.status, 'pending'), gt(conversationRequests.leaseUntil, new Date()))).limit(1)
    if (busy) throw new Error('conversation busy')
    await tx.insert(conversationRequests).values({ id: requestId, userId, sessionId, inputHash, leaseUntil: new Date(Date.now() + 15 * 60_000) })
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
