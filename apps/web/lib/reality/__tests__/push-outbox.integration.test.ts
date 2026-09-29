import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db, users, userSettings, contactProfiles, realityContacts, realityPushJobs, pushSubscriptions, roleplaySessions, characterRevisions, characterRuntimeStates } from '@miro/db'
import { createAgencyState } from '@miro/domain'
import * as providers from '@miro/providers'
import { createRoleplaySession } from '@/lib/simulation/start'
import { enqueueRealityPush, deliverRealityPush } from '../push-outbox'
import { cloneAsReality, dropRealityClones } from './fixtures'

const made: string[] = []
const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const now = new Date()
async function queued() {
  const [u] = await db.insert(users).values({ email: `push-${randomUUID()}@example.test` }).returning()
  made.push(u!.id)
  await db.insert(userSettings).values({ userId: u!.id, timeZone: 'Asia/Seoul' })
  // 발송은 미로 캐릭터에만 열린다. 시드 토마스는 chat 이라 사용자 소유의 reality 복제본으로 세션을 연다.
  const thomas = await cloneAsReality('thomas', { ownerId: u!.id })
  const { sessionId } = await createRoleplaySession(u!.id, thomas.id)
  const [sub] = await db.insert(pushSubscriptions).values({ userId: u!.id, endpoint: `https://example.test/${randomUUID()}`, p256dh: 'test', auth: 'test' }).returning()
  const [contact] = await db.insert(realityContacts).values({ sessionId, channel: 'message', dedupeKey: randomUUID(), status: 'sent', payload: { text: '안녕', senderLabel: '토마스' } }).returning()
  await db.transaction(tx => enqueueRealityPush(tx, contact!.id, u!.id))
  const [job] = await db.select().from(realityPushJobs).where(eq(realityPushJobs.contactId, contact!.id))
  await db.update(realityPushJobs).set({ nextAttemptAt: now }).where(eq(realityPushJobs.id, job!.id))
  const send = vi.fn<providers.PushProvider['send']>().mockResolvedValue({ ok: true })
  vi.spyOn(providers, 'resolvePush').mockReturnValue({ info: { mode: 'mock', name: 'test', notice: null }, send })
  return { userId: u!.id, sessionId, sub: sub!, contact: contact!, job: job!, send }
}
afterEach(() => vi.restoreAllMocks())
afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)); await dropRealityClones() })
describeDb('durable proactive push', () => {
  it('deduplicates enqueue and concurrent workers', async () => {
    const s = await queued()
    await db.transaction(tx => enqueueRealityPush(tx, s.contact.id, s.userId))
    await Promise.all([deliverRealityPush(now), deliverRealityPush(now)])
    expect(s.send).toHaveBeenCalledTimes(1)
    const rows = await db.select().from(realityPushJobs).where(eq(realityPushJobs.contactId, s.contact.id))
    expect(rows).toHaveLength(1); expect(rows[0]!.status).toBe('sent')
  })
  it('retries transient failure without creating another message', async () => {
    const s = await queued()
    s.send.mockResolvedValueOnce({ ok: false, gone: false, error: 'temporary' })
    await deliverRealityPush(now)
    const [retry] = await db.select().from(realityPushJobs).where(eq(realityPushJobs.id, s.job.id))
    expect(retry!.status).toBe('pending')
    await deliverRealityPush(new Date(retry!.nextAttemptAt.getTime() + 1))
    expect(s.send).toHaveBeenCalledTimes(2)
    expect(await db.select().from(realityContacts).where(eq(realityContacts.id, s.contact.id))).toHaveLength(1)
  })
  it('recovers an expired worker lease', async () => {
    const s = await queued()
    await db.update(realityPushJobs).set({ status: 'sending', leaseToken: randomUUID(), leaseUntil: new Date(now.getTime() - 1) }).where(eq(realityPushJobs.id, s.job.id))
    await deliverRealityPush(now)
    expect(s.send).toHaveBeenCalledTimes(1)
  })
  it('may repeat a push after delivery succeeds but completion is interrupted', async () => {
    const s = await queued()
    const tags: string[] = []
    s.send.mockImplementationOnce(async (_subscription, payload) => {
      tags.push(payload.tag)
      throw new Error('ack lost after delivery')
    }).mockImplementationOnce(async (_subscription, payload) => {
      tags.push(payload.tag)
      return { ok: true }
    })
    await deliverRealityPush(now)
    const [retry] = await db.select().from(realityPushJobs).where(eq(realityPushJobs.id, s.job.id))
    expect(retry!.status).toBe('pending')
    await deliverRealityPush(new Date(retry!.nextAttemptAt.getTime() + 1))
    expect(tags).toEqual([`session:${s.sessionId}`, `session:${s.sessionId}`])
    expect(await db.select().from(realityContacts).where(eq(realityContacts.id, s.contact.id))).toHaveLength(1)
  })
  it('cancels queued delivery after the creator disables contact', async () => {
    const s = await queued()
    const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, s.sessionId))
    await db.update(contactProfiles).set({ enabled: false }).where(eq(contactProfiles.characterId, session!.characterId))
    await deliverRealityPush(now)
    expect(s.send).not.toHaveBeenCalled()
    expect((await db.select().from(realityPushJobs).where(eq(realityPushJobs.id, s.job.id)))[0]!.status).toBe('cancelled')
  })
  // 앱 밖 연락은 끌 수 없다 (2026-09-24) — 예전에 저장된 알림 끄기·야간 차단 값이 있어도 보낸다. 거절은 브라우저 권한으로만 한다.
  it('delivers even when old stored settings said otherwise', async () => {
    const s = await queued()
    await db.update(userSettings).set({ pushEnabled: false, quietHoursEnabled: true, quietHoursStart: '00:00', quietHoursEnd: '23:59' }).where(eq(userSettings.userId, s.userId))
    await deliverRealityPush(now)
    expect(s.send).toHaveBeenCalledTimes(1)
    expect((await db.select().from(realityPushJobs).where(eq(realityPushJobs.id, s.job.id)))[0]!.status).toBe('sent')
  })
  // §5: 약속 취소 뒤 발송 0 — 큐에 든 뒤 결정의 행동이 취소되면 기기로 나가지 않는다.
  it('cancels a queued push whose decision was cancelled after it was queued', async () => {
    const s = await queued()
    const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, s.sessionId))
    const [revision] = await db.insert(characterRevisions).values({ characterId: session!.characterId, sourceHash: randomUUID(), authored: { fields: {}, explicitFields: [] },
      profile: {} as never, status: 'pending' }).returning({ id: characterRevisions.id })
    const state = createAgencyState(revision!.id, now.toISOString())
    const decisionId = `${s.sessionId}:${revision!.id}:1`
    // 운영에서 실제로 생기는 모양: 메시지 저장과 함께 행동은 이미 'sent', 취소 표시는 그 행동이 이행하던 약속에 남는다.
    state.goals = [{ id: 'goal:1:0', description: '저녁에 연락한다.', evidenceIds: [], ruleIds: [], priority: 1, status: 'cancelled', createdAt: now.toISOString(), updatedAt: now.toISOString(), success: 'sent' }]
    state.actions = [{ id: decisionId, type: 'contact', status: 'sent', evidenceIds: [], goalIds: ['goal:1:0'], fulfillsGoalIds: ['goal:1:0'], createdAt: now.toISOString(), updatedAt: now.toISOString() }]
    await db.insert(characterRuntimeStates).values({ sessionId: s.sessionId, revisionId: revision!.id, mode: 'live', state })
    await db.update(realityContacts).set({ payload: { text: '안녕', senderLabel: '토마스', decisionId } }).where(eq(realityContacts.id, s.contact.id))
    await deliverRealityPush(now)
    expect(s.send).not.toHaveBeenCalled()
    expect((await db.select().from(realityPushJobs).where(eq(realityPushJobs.id, s.job.id)))[0]!.status).toBe('cancelled')
  })
  it('does not deliver for a deleted conversation', async () => {
    const s = await queued()
    await db.update(roleplaySessions).set({ deletedAt: now }).where(eq(roleplaySessions.id, s.sessionId))
    await deliverRealityPush(now)
    expect(s.send).not.toHaveBeenCalled()
  })
  it('is inaccessible to public API roles', async () => {
    const result = await db.execute<{ enabled: boolean; allowed: boolean }>(sql`select relrowsecurity as enabled,
      exists (select 1 from (values ('anon'), ('authenticated')) roles(name) cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) permissions(name) where has_table_privilege(roles.name, 'reality_push_jobs', permissions.name)) as allowed
      from pg_class where oid='reality_push_jobs'::regclass`)
    expect(result[0]).toEqual({ enabled: true, allowed: false })
  })
})
