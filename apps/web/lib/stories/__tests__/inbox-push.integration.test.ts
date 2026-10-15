import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, users, userSettings, pushSubscriptions, storyContacts, storyMessages, storyPushJobs, storyRuns } from '@miro/db'
import type { StoryState } from '@miro/domain'
import * as providers from '@miro/providers'
import { testDatabaseUrl } from '../../../../../tooling/test-database'
import { listSessions, unreadContactCount, type ArchiveCursor } from '@/lib/ops/archive'
import { seedStories } from '../seed'
import { STORY_DEFINITIONS } from '../content'
import { startRun, storyBySlug } from '../repo'
import { enqueueStoryPush, deliverStoryPush, storyThreadUrl } from '../push-outbox'
import { markThreadRead } from '../contacts'

const describeDb = testDatabaseUrl(process.env.DATABASE_URL) ? describe : describe.skip
const made: string[] = []
const now = new Date('2026-10-15T04:00:00Z')
let storyId: string
async function fixture() {
  const [user] = await db.insert(users).values({ email: `story-inbox-${randomUUID()}@example.test` }).returning()
  made.push(user!.id)
  await db.insert(userSettings).values({ userId: user!.id, timeZone: 'Asia/Seoul', language: 'en' })
  const run = await startRun(user!.id, storyId, { name: '한서', age: 23, honorific: '', details: {} }, { fresh: false, contactOptIn: true })
  const [sub] = await db.insert(pushSubscriptions).values({ userId: user!.id, endpoint: `https://example.test/${randomUUID()}`, p256dh: 'test', auth: 'test' }).returning()
  const [contact] = await db.insert(storyContacts).values({ runId: run.id, ruleId: 'test', key: randomUUID(), speaker: 'C2', dueAt: now, scheduledScene: 0, status: 'sent', sentAt: now }).returning()
  const [message] = await db.insert(storyMessages).values({ runId: run.id, channel: 'dm', thread: 'C2', role: 'character', speaker: 'C2', content: '연락 본문은 잠금화면에 나오지 않아야 해요', contactId: contact!.id, createdAt: now }).returning()
  await db.update(storyContacts).set({ messageId: message!.id }).where(eq(storyContacts.id, contact!.id))
  await db.transaction(tx => enqueueStoryPush(tx, contact!.id, user!.id, now))
  const [job] = await db.select().from(storyPushJobs).where(eq(storyPushJobs.contactId, contact!.id))
  const send = vi.fn<providers.PushProvider['send']>().mockResolvedValue({ ok: true })
  vi.spyOn(providers, 'resolvePush').mockReturnValue({ info: { mode: 'mock', name: 'test', notice: null }, send })
  return { user: user!, run, sub: sub!, contact: contact!, message: message!, job: job!, send }
}
const jobOf = async (id: string) => (await db.select().from(storyPushJobs).where(eq(storyPushJobs.id, id)))[0]!
afterEach(async () => { vi.restoreAllMocks(); for (const id of made.splice(0)) await db.delete(users).where(eq(users.id, id)) })
afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })
describeDb('story inbox and durable push', () => {
  beforeAll(async () => { await seedStories(STORY_DEFINITIONS, { apply: true }); storyId = (await storyBySlug('original-academy'))!.id })
  it('lists the correct character and run, scopes ownership, and clears the shared badge on read', async () => {
    const s = await fixture()
    const row = (await listSessions(s.user.id)).items[0]!
    expect(row.href).toBe(storyThreadUrl(s.run.id, 'C2'))
    expect(row.storyTitle).toBeTruthy(); expect(row.runNo).toBe(1); expect(row.unread).toBe(1)
    expect(await unreadContactCount(s.user.id)).toBe(1)
    const stranger = await fixture()
    expect((await listSessions(stranger.user.id)).items.some(r => r.id === row.id)).toBe(false)
    await markThreadRead(s.run.id, 'C2', now, [s.message.id])
    expect(await unreadContactCount(s.user.id)).toBe(0)
    expect((await listSessions(s.user.id)).items[0]!.unread).toBe(0)
  })
  it('keeps pagination stable across story threads and archived runs', async () => {
    const s = await fixture()
    for (let i = 0; i < 7; i++) {
      const run = await startRun(s.user.id, storyId, { name: '한서', age: 23, honorific: '', details: {} }, { fresh: true, contactOptIn: true })
      await db.insert(storyMessages).values(['C1', 'C2', 'C3', 'C4'].map(thread => ({ runId: run.id, channel: 'dm' as const, thread, role: 'character' as const, speaker: thread, content: '각 회차의 연락', createdAt: now })))
    }
    const seen: string[] = []; let cursor: ArchiveCursor | null = null
    do { const page = await listSessions(s.user.id, { cursor }); seen.push(...page.items.map(r => r.id)); cursor = page.nextCursor } while (cursor)
    expect(seen).toHaveLength(29); expect(new Set(seen).size).toBe(29)
    expect(await unreadContactCount(s.user.id)).toBe(4)
  })
  it('enqueues once, serializes concurrent workers and sends a private, localized per-character link', async () => {
    const s = await fixture()
    await db.transaction(tx => enqueueStoryPush(tx, s.contact.id, s.user.id, now))
    await Promise.all([deliverStoryPush(now), deliverStoryPush(now)])
    expect(s.send).toHaveBeenCalledTimes(1)
    expect(s.send.mock.calls[0]![1]).toMatchObject({ url: storyThreadUrl(s.run.id, 'C2'), tag: `story:${s.run.id}:C2` })
    expect(s.send.mock.calls[0]![1].body).not.toContain('연락 본문')
    expect((await jobOf(s.job.id)).status).toBe('sent')
  })
  it('retries transport errors without duplicating messages', async () => {
    const s = await fixture()
    s.send.mockResolvedValueOnce({ ok: false, gone: false, error: 'temporary' })
    await deliverStoryPush(now)
    const job = await jobOf(s.job.id)
    expect(job.status).toBe('pending'); expect(job.attempts).toBe(1)
    await deliverStoryPush(new Date(job.nextAttemptAt.getTime() + 1))
    expect(s.send).toHaveBeenCalledTimes(2)
    expect(await db.select().from(storyMessages).where(eq(storyMessages.runId, s.run.id))).toHaveLength(1)
  })
  it.each(['read', 'archived', 'stopped', 'global_off', 'deleted'] as const)('cancels on %s before external send', async reason => {
    const s = await fixture()
    if (reason === 'read') await markThreadRead(s.run.id, 'C2', now)
    if (reason === 'archived') await db.update(storyRuns).set({ status: 'archived' }).where(eq(storyRuns.id, s.run.id))
    if (reason === 'stopped') { const state = s.run.state as StoryState; state.rel.C2!.contact = 'stopped'; await db.update(storyRuns).set({ state }).where(eq(storyRuns.id, s.run.id)) }
    if (reason === 'global_off') await db.update(userSettings).set({ pushEnabled: false }).where(eq(userSettings.userId, s.user.id))
    if (reason === 'deleted') await db.update(users).set({ deletedAt: now }).where(eq(users.id, s.user.id))
    await deliverStoryPush(now)
    expect(s.send).not.toHaveBeenCalled(); expect((await jobOf(s.job.id)).status).toBe('cancelled')
  })
  it('holds quiet hours without spending attempts', async () => {
    const s = await fixture()
    await db.update(userSettings).set({ quietHoursEnabled: true, quietHoursStart: '12:00', quietHoursEnd: '14:00' }).where(eq(userSettings.userId, s.user.id))
    await deliverStoryPush(now)
    expect(s.send).not.toHaveBeenCalled(); expect(await jobOf(s.job.id)).toMatchObject({ status: 'pending', attempts: 0, errorCode: 'quiet_hours' })
  })
  it('retires expired subscriptions', async () => {
    const s = await fixture()
    s.send.mockResolvedValueOnce({ ok: false, gone: true, error: 'gone' })
    await deliverStoryPush(now)
    expect((await jobOf(s.job.id)).status).toBe('failed')
    expect((await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, s.sub.id)))[0]!.failedAt).not.toBeNull()
  })
  it('recovers crashed leases and limits errors to five attempts', async () => {
    const s = await fixture()
    await db.update(storyPushJobs).set({ status: 'sending', leaseToken: randomUUID(), leaseUntil: new Date(now.getTime() - 1), attempts: 4 }).where(eq(storyPushJobs.id, s.job.id))
    s.send.mockRejectedValueOnce(new Error('provider offline'))
    await deliverStoryPush(now)
    expect(await jobOf(s.job.id)).toMatchObject({ status: 'failed', attempts: 5 })
  })
  it('does not mark messages that arrived after the displayed snapshot as read', async () => {
    const s = await fixture()
    await db.insert(storyMessages).values({ runId: s.run.id, channel: 'dm', thread: 'C2', role: 'character', content: '다음 연락' })
    await markThreadRead(s.run.id, 'C2', now, [s.message.id])
    expect(await unreadContactCount(s.user.id)).toBe(1)
  })
})
