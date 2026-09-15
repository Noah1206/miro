import { and, eq, lt } from 'drizzle-orm'
import { db, aiEvaluationSamples, aiBudgetCounters, conversationRequests, usageLedger } from '@miro/db'
import { rollback } from '@/lib/usage/guard'
/** Bounded cleanup: abandoned reservations cannot consume a user's pool forever. */
export async function maintainAI(now = new Date()) {
  const expired = await db.select({id:conversationRequests.id}).from(conversationRequests)
    .where(and(eq(conversationRequests.status,'pending'),lt(conversationRequests.leaseUntil,now))).limit(100)
  for (const r of expired) {
    const [ledger] = await db.select({id:usageLedger.id}).from(usageLedger).where(eq(usageLedger.idempotencyKey,`turn:${r.id}`)).limit(1)
    if (ledger) await rollback(ledger.id)
    await db.update(conversationRequests).set({status:'failed'}).where(and(eq(conversationRequests.id,r.id),eq(conversationRequests.status,'pending')))
  }
  await db.delete(aiEvaluationSamples).where(lt(aiEvaluationSamples.createdAt,new Date(now.getTime()-30*86400_000)))
  await db.delete(aiBudgetCounters).where(lt(aiBudgetCounters.expiresAt,now))
}
