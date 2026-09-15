import { and, eq, lt } from 'drizzle-orm'
import { db, aiEvaluationSamples, aiBudgetCounters, conversationRequests } from '@miro/db'
import { failRequest } from './gateway'
/** Bounded cleanup: abandoned reservations cannot consume a user's pool forever. */
export async function maintainAI(now = new Date()) {
  const expired = await db.select({id:conversationRequests.id}).from(conversationRequests)
    .where(and(eq(conversationRequests.status,'pending'),lt(conversationRequests.leaseUntil,now))).limit(100)
  for (const r of expired) await failRequest(r.id, now)
  await db.delete(aiEvaluationSamples).where(lt(aiEvaluationSamples.createdAt,new Date(now.getTime()-30*86400_000)))
  await db.delete(aiBudgetCounters).where(lt(aiBudgetCounters.expiresAt,now))
}
