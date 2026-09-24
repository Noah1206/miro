import { randomUUID } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, realityPushJobs, realityContacts, pushSubscriptions, roleplaySessions, users, contactProfiles, messages, characters } from '@miro/db'
import { feature, productionRuntime } from '@miro/config'
import { resolvePush } from '@miro/providers'
import type { UsageTransaction } from '@/lib/usage/guard'
import { observe } from '@/lib/observe'

export async function enqueueRealityPush(tx: UsageTransaction, contactId: string, userId: string) {
  const subscriptions = await tx.select({ id: pushSubscriptions.id }).from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.failedAt)))
  if (subscriptions.length) await tx.insert(realityPushJobs).values(subscriptions.map(s => ({ contactId, subscriptionId: s.id }))).onConflictDoNothing()
}

/** At-least-once delivery: leases recover crashes; a stable notification tag collapses retries. */
export async function deliverRealityPush(now = new Date(), limit = 20): Promise<number> {
  if (!feature('realityMessage')) return 0
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid push batch size')
  const token = randomUUID()
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE reality_push_jobs SET status = 'sending', lease_token = ${token}::uuid,
      lease_until = ${new Date(now.getTime() + 120_000).toISOString()}::timestamptz,
      attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM reality_push_jobs
      WHERE ((status = 'pending' AND next_attempt_at <= ${now.toISOString()}::timestamptz)
        OR (status = 'sending' AND lease_until <= ${now.toISOString()}::timestamptz))
      ORDER BY next_attempt_at LIMIT ${limit} FOR UPDATE SKIP LOCKED
    ) RETURNING id
  `)
  for (const job of claimed) {
    const [row] = await db.select({ job: realityPushJobs, contact: realityContacts, subscription: pushSubscriptions,
      session: roleplaySessions, user: users, profile: contactProfiles, message: messages,
      experienceType: characters.experienceType, characterDeletedAt: characters.deletedAt }).from(realityPushJobs)
      .innerJoin(realityContacts, eq(realityContacts.id, realityPushJobs.contactId))
      .innerJoin(pushSubscriptions, eq(pushSubscriptions.id, realityPushJobs.subscriptionId))
      .innerJoin(roleplaySessions, eq(roleplaySessions.id, realityContacts.sessionId))
      .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
      .innerJoin(users, eq(users.id, roleplaySessions.userId))
      .leftJoin(contactProfiles, eq(contactProfiles.characterId, roleplaySessions.characterId))
      .leftJoin(messages, eq(messages.id, realityContacts.messageId))
      .where(and(eq(realityPushJobs.id, job.id), eq(realityPushJobs.leaseToken, token))).limit(1)
    if (!row) continue
    const finish = (status: 'sent' | 'cancelled' | 'failed' | 'pending') => db.update(realityPushJobs).set({ status,
      leaseUntil: null, leaseToken: null,
      nextAttemptAt: new Date(now.getTime() + Math.min(3600_000, 60_000 * 2 ** Math.min(row.job.attempts, 6))),
    }).where(and(eq(realityPushJobs.id, job.id), eq(realityPushJobs.leaseToken, token)))
    // 큐에 든 뒤 캐릭터가 chat 으로 바뀌었거나 지워졌으면 발송하지 않는다 — 발송 시점에 자격을 다시 본다.
    if (row.experienceType !== 'reality' || row.characterDeletedAt
      || row.user.deletedAt || row.session.deletedAt || row.session.restrictedAt || row.session.status !== 'active'
      || !row.profile?.enabled || row.message?.hiddenAt
      || row.subscription.userId !== row.user.id || row.subscription.failedAt
      || row.contact.status === 'opened' || row.contact.status === 'suppressed'
      || now.getTime() - row.contact.createdAt.getTime() > 12 * 3600_000) {
      await finish('cancelled'); continue
    }
    if (row.job.attempts > 5) { await finish('failed'); continue }
    const payload = row.contact.payload
    try {
      const provider = resolvePush()
      if (productionRuntime() && provider.info.mode !== 'live') throw new Error('PUSH_NOT_READY')
      const result = await provider.send(row.subscription, {
        title: typeof payload.senderLabel === 'string' ? payload.senderLabel : 'MIRO',
        body: typeof payload.text === 'string' ? payload.text.slice(0, 90) : '새로운 연락이 왔어요.',
        url: `/chat/${row.session.id}`, tag: `session:${row.session.id}`,
      })
      if (result.ok) await finish('sent')
      else {
        if (result.gone) await db.update(pushSubscriptions).set({ failedAt: now }).where(eq(pushSubscriptions.id, row.subscription.id))
        await finish(result.gone || row.job.attempts >= 5 ? 'failed' : 'pending')
      }
    } catch {
      observe('reality.push_retry', { jobId: job.id, attempt: row.job.attempts })
      await finish(row.job.attempts >= 5 ? 'failed' : 'pending')
    }
  }
  return claimed.length
}
