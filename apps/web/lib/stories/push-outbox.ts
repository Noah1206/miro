import { randomUUID } from 'node:crypto'
import { and, eq, isNull, lte, or } from 'drizzle-orm'
import { db, storyContacts, storyMessages, storyPushJobs, storyRuns, pushSubscriptions, users, userSettings } from '@miro/db'
import { inQuiet, localParts, type StoryState } from '@miro/domain'
import { feature, productionRuntime } from '@miro/config'
import { resolvePush } from '@miro/providers'
import { definitionOf } from './repo'
import { translateTo } from '@/lib/i18n/server'
import { observe } from '@/lib/observe'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
export const storyThreadUrl = (runId: string, thread: string) => `/messages/story/${runId}/${encodeURIComponent(thread)}`

/** Message and notification jobs commit together. No historical-message backfill when enabling push. */
export async function enqueueStoryPush(tx: Tx, contactId: string, userId: string, now: Date) {
  if (!feature('storyPush')) return
  const subs = await tx.select({ id: pushSubscriptions.id }).from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.failedAt)))
  if (subs.length) await tx.insert(storyPushJobs).values(subs.map(s => ({ contactId, subscriptionId: s.id, nextAttemptAt: now, createdAt: now }))).onConflictDoNothing()
}

/** At-least-once transport; stable per-thread tags collapse retries on the device. */
export async function deliverStoryPush(now = new Date(), limit = 20) {
  if (!feature('storyPush')) return 0
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid push batch size')
  const token = randomUUID()
  const ids = await db.transaction(async tx => {
    const rows = await tx.select({ id: storyPushJobs.id }).from(storyPushJobs).where(or(
      and(eq(storyPushJobs.status, 'pending'), lte(storyPushJobs.nextAttemptAt, now)),
      and(eq(storyPushJobs.status, 'sending'), lte(storyPushJobs.leaseUntil, now)),
    )).orderBy(storyPushJobs.nextAttemptAt).limit(limit).for('update', { skipLocked: true })
    for (const row of rows) await tx.update(storyPushJobs).set({ status: 'sending', leaseToken: token, leaseUntil: new Date(now.getTime() + 120_000) }).where(eq(storyPushJobs.id, row.id))
    return rows.map(r => r.id)
  })
  for (const id of ids) {
    try {
      await db.transaction(async tx => {
        const [job] = await tx.select().from(storyPushJobs).where(and(eq(storyPushJobs.id, id), eq(storyPushJobs.leaseToken, token))).for('update')
        if (!job) return
        const finish = (status: 'pending' | 'sent' | 'cancelled' | 'failed', errorCode: string | null = null, attempts = job.attempts) => tx.update(storyPushJobs).set({ status, errorCode, attempts,
          leaseUntil: null, leaseToken: null, nextAttemptAt: new Date(now.getTime() + Math.min(3600_000, 60_000 * 2 ** Math.min(attempts, 6))) }).where(eq(storyPushJobs.id, id))
        const [contact] = await tx.select().from(storyContacts).where(eq(storyContacts.id, job.contactId))
        if (!contact?.messageId) { await finish('cancelled', 'message_missing'); return }
        // These locks serialize the send with archiving, contact switches and read receipts.
        const [run] = await tx.select().from(storyRuns).where(eq(storyRuns.id, contact.runId)).for('share')
        const [message] = await tx.select().from(storyMessages).where(eq(storyMessages.id, contact.messageId)).for('share')
        const [sub] = await tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, job.subscriptionId)).for('update')
        if (!run || !message || !sub) { await finish('cancelled', 'recipient_missing'); return }
        const [owner] = await tx.select().from(users).where(eq(users.id, run.userId)).for('share')
        const [settings] = await tx.select().from(userSettings).where(eq(userSettings.userId, run.userId)).for('share')
        const state = run.state as StoryState
        if (!owner || owner.deletedAt || run.status === 'archived' || contact.status !== 'sent' || message.readAt
          || sub.failedAt || sub.userId !== run.userId || settings?.pushEnabled === false
          || !state.contactOptIn || state.premise === 'refused' || state.rel[contact.speaker]?.contact !== 'allowed'
          || now.getTime() - contact.sentAt!.getTime() > 12 * 3600_000) {
          await finish('cancelled', 'no_longer_deliverable'); return
        }
        const def = await definitionOf(run.storyId)
        if (!settings?.timeZone) { await finish('pending', 'timezone_unknown'); return }
        const local = localParts(now, settings.timeZone)
        if (inQuiet(local.minutes, def.contactPolicy.quiet) || (settings.quietHoursEnabled && inQuiet(local.minutes, { start: settings.quietHoursStart, end: settings.quietHoursEnd }))) {
          await finish('pending', 'quiet_hours'); return
        }
        if (job.attempts >= 5) { await finish('failed', 'attempt_limit'); return }
        const provider = resolvePush()
        if (productionRuntime() && provider.info.mode !== 'live') throw new Error('PUSH_NOT_READY')
        const result = await provider.send(sub, {
          title: def.characters.find(c => c.key === contact.speaker)?.name ?? 'MIRO',
          body: translateTo(settings.language, '새 연락이 도착했어요.'),
          url: storyThreadUrl(run.id, contact.speaker), tag: `story:${run.id}:${contact.speaker}`,
        })
        if (result.ok) { await finish('sent', null, job.attempts + 1); observe('story.push_sent', { jobId: id }) }
        else {
          if (result.gone) await tx.update(pushSubscriptions).set({ failedAt: now }).where(eq(pushSubscriptions.id, sub.id))
          await finish(result.gone || job.attempts + 1 >= 5 ? 'failed' : 'pending', result.gone ? 'subscription_gone' : 'transport_error', job.attempts + 1)
        }
      })
    } catch {
      // The send transaction rolled back; persist retry state independently.
      const [job] = await db.select().from(storyPushJobs).where(and(eq(storyPushJobs.id, id), eq(storyPushJobs.leaseToken, token)))
      if (job) await db.update(storyPushJobs).set({ status: job.attempts + 1 >= 5 ? 'failed' : 'pending', attempts: job.attempts + 1, errorCode: 'transport_error',
        leaseUntil: null, leaseToken: null, nextAttemptAt: new Date(now.getTime() + 5 * 60_000) }).where(and(eq(storyPushJobs.id, id), eq(storyPushJobs.leaseToken, token)))
      observe('story.push_retry', { jobId: id })
    }
  }
  return ids.length
}
