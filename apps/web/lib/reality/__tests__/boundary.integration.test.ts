import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, users, userSettings, characters, roleplaySessions, messages, memories, relationships, stateTransitions, realityContacts,
  realityPushJobs, pushSubscriptions } from '@miro/db'
import * as providers from '@miro/providers'
import { POLICY, tokenPricing, tokenQuote } from '@miro/config'
import * as chatModels from '@/lib/ai/chat-models'
import { runConversationTurn } from '@/lib/simulation/turn'
import { beginRequest, failRequest } from '@/lib/ai/gateway'
import { createRoleplaySession } from '@/lib/simulation/start'
import { adoptRelationshipPolicy } from '@/lib/agency/session-policy'
import { applyContactBoundaryRequest } from '../boundary'
import { evaluateSession } from '../evaluate'
import { deliverRealityPush, enqueueRealityPush } from '../push-outbox'
import { cloneAsReality, dropRealityClones } from './fixtures'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const made: string[] = []
async function fixture(experienceType: 'chat' | 'reality' = 'reality') {
  const [u] = await db.insert(users).values({ email: `boundary-${randomUUID()}@example.test` }).returning()
  made.push(u!.id)
  await db.insert(userSettings).values({ userId: u!.id, timeZone: 'Asia/Seoul' })
  const c = await cloneAsReality('thomas', { ownerId: u!.id })
  if (experienceType === 'chat') await db.update(characters).set({ experienceType }).where(eq(characters.id, c.id))
  const { sessionId } = await createRoleplaySession(u!.id, c.id)
  return { userId: u!.id, sessionId }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function request(s: Fixture, text: string) {
  const r = await beginRequest(s.userId, s.sessionId, text)
  const result = await applyContactBoundaryRequest(s.sessionId, s.userId, text, r.requestId, new Date(), 'Asia/Seoul')
  await failRequest(r.requestId)
  return { result, requestId: r.requestId }
}
async function queued(s: Fixture) {
  const [subscription] = await db.insert(pushSubscriptions).values({ userId: s.userId, endpoint: `https://example.test/${randomUUID()}`, p256dh: 'test', auth: 'test' }).returning()
  const [contact] = await db.insert(realityContacts).values({ sessionId: s.sessionId, channel: 'message', dedupeKey: randomUUID(), status: 'sent', payload: { text: '약속한 이야기', senderLabel: '토마스' } }).returning()
  await db.transaction(tx => enqueueRealityPush(tx, contact!.id, s.userId))
  const [job] = await db.select().from(realityPushJobs).where(eq(realityPushJobs.contactId, contact!.id))
  return { subscription: subscription!, contact: contact!, job: job! }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)); await dropRealityClones() })
describeDb('relationship experience — durable boundaries and preserved history', () => {
  it('stops every background path before AI generation and does not wait for an AI acknowledgement', async () => {
    const s = await fixture()
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', urgency: 1, reason: '약속한 연락', answers: 'user_message' } }).where(eq(roleplaySessions.id, s.sessionId))
    const create = vi.spyOn(providers, 'createAI')
    const { result } = await request(s, '앞으로 연락하지 마')
    expect(result?.mode).toBe('blocked')
    expect(await evaluateSession(s.sessionId)).toEqual({ outcome: 'suppressed', reason: 'user_boundary' })
    expect(await evaluateSession(s.sessionId, new Date(), { inline: true })).toEqual({ outcome: 'suppressed', reason: 'user_boundary' })
    expect(create).not.toHaveBeenCalled()
    expect((await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, s.sessionId)))[0]!.pendingRealityIntent).toBeNull()
  })
  it('accepts a contact stop through the app even when the token wallet cannot fund an AI reply', async () => {
    const s = await fixture()
    const pricing = tokenPricing()
    vi.spyOn(chatModels, 'resolveChatModel').mockResolvedValue({ modelId: 'priced-test', metered: true,
      tier: POLICY.chatTier.miro, tierName: 'miro', pricing,
      quote: tokenQuote({ inputCost: 2, outputCost: 10, maxContextTokens: 200000, maxOutputTokens: 2048 }, 2048, pricing) })
    const create = vi.spyOn(providers, 'createAI')
    const result = await runConversationTurn({ userId: s.userId, sessionId: s.sessionId, requestId: randomUUID(), input: '앞으로 연락하지 마' })
    expect(result).toMatchObject({ ok: false, reason: 'usage' })
    expect(create).not.toHaveBeenCalled()
    expect((await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, s.sessionId)))[0]!.contactBoundary?.mode).toBe('blocked')
    expect(await evaluateSession(s.sessionId)).toEqual({ outcome: 'suppressed', reason: 'user_boundary' })
  })
  it('cancels old notifications permanently and lifts the boundary only by explicit permission', async () => {
    const s = await fixture(), q = await queued(s)
    await request(s, '오늘은 혼자 있고 싶어')
    await request(s, '너는 지금 뭐해?')
    expect((await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, s.sessionId)))[0]!.contactBoundary?.mode).toBe('paused')
    await request(s, '이제 먼저 연락해도 괜찮아')
    const send = vi.fn<providers.PushProvider['send']>().mockResolvedValue({ ok: true })
    vi.spyOn(providers, 'resolvePush').mockReturnValue({ info: { mode: 'mock', name: 'recorded', notice: null }, send })
    await deliverRealityPush(new Date())
    expect(send).not.toHaveBeenCalled()
    expect((await db.select().from(realityPushJobs).where(eq(realityPushJobs.id, q.job.id)))[0]!.status).toBe('cancelled')
    const changes = await db.select().from(stateTransitions).where(and(eq(stateTransitions.sessionId, s.sessionId), eq(stateTransitions.field, 'contact.boundary')))
    expect(changes).toHaveLength(2)
  })
  it('makes repeated requests idempotent and rejects another owner', async () => {
    const s = await fixture(), other = await fixture()
    const r = await beginRequest(s.userId, s.sessionId, '연락하지 마')
    expect(await applyContactBoundaryRequest(s.sessionId, other.userId, '연락하지 마', r.requestId, new Date(), 'Asia/Seoul')).toBeNull()
    await Promise.all([1, 2].map(() => applyContactBoundaryRequest(s.sessionId, s.userId, '연락하지 마', r.requestId, new Date(), 'Asia/Seoul')))
    expect(await db.select().from(stateTransitions).where(and(eq(stateTransitions.sessionId, s.sessionId), eq(stateTransitions.field, 'contact.boundary')))).toHaveLength(1)
  })
  it('rejects a contact generated before a new pause rather than saving stale outreach', async () => {
    const s = await fixture()
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', urgency: 1, reason: '약속한 연락' } }).where(eq(roleplaySessions.id, s.sessionId))
    const llm: providers.LLMProvider = { info: { mode: 'mock', name: 'pause-race', notice: null }, async generateStructured(r) {
      await request(s, '앞으로 연락하지 마')
      return r.schema.parse({ text: '약속한 이야기를 하려고 연락했어요.', tone: 'neutral' })
    } }
    vi.spyOn(providers, 'createAI').mockReturnValue(llm as ReturnType<typeof providers.createAI>)
    expect(await evaluateSession(s.sessionId, new Date(), { inline: true })).toEqual({ outcome: 'skipped', reason: 'state_changed' })
    expect(await db.select().from(messages).where(and(eq(messages.sessionId, s.sessionId), eq(messages.kind, 'reality_message')))).toHaveLength(0)
  })
  it('serializes a pause with external send start and blocks every later notification', async () => {
    const s = await fixture(), q = await queued(s)
    let entered!: () => void, release!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const barrier = new Promise<void>(resolve => { release = resolve })
    const send = vi.fn<providers.PushProvider['send']>().mockImplementation(async () => { entered(); await barrier; return { ok: true } })
    vi.spyOn(providers, 'resolvePush').mockReturnValue({ info: { mode: 'mock', name: 'delivery-race', notice: null }, send })
    const worker = deliverRealityPush(new Date())
    await started
    let paused = false
    const pause = request(s, '연락하지 마').then(() => { paused = true })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(paused).toBe(false)
    release()
    await Promise.all([worker, pause])
    expect((await db.select().from(realityPushJobs).where(eq(realityPushJobs.id, q.job.id)))[0]!.status).toBe('sent')
    const later = await queued(s)
    await deliverRealityPush(new Date())
    expect(send).toHaveBeenCalledTimes(1)
    expect((await db.select().from(realityPushJobs).where(eq(realityPushJobs.id, later.job.id)))[0]!.status).toBe('cancelled')
  })
  it('adopts an existing reality session exactly once while keeping messages, memory and relationship values', async () => {
    const s = await fixture()
    const [message] = await db.insert(messages).values({ sessionId: s.sessionId, role: 'user', content: '나는 따뜻한 우유를 좋아해.', turnIndex: 1 }).returning()
    const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, s.sessionId))
    await db.insert(memories).values({ sessionId: s.sessionId, characterId: session!.characterId, type: 'long', content: '사용자는 따뜻한 우유를 좋아한다.',
      importance: 70, persistence: 80, confidence: 90, sourceMessageId: message!.id })
    const before = await db.select().from(relationships).where(eq(relationships.sessionId, s.sessionId))
    const stored = await db.select().from(memories).where(eq(memories.sessionId, s.sessionId))
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'live'); vi.stubEnv('MIRO_AGENCY_DEFAULT_POLICY', 'agency:v1')
    await Promise.all([adoptRelationshipPolicy(s.sessionId, s.userId), adoptRelationshipPolicy(s.sessionId, s.userId)])
    expect((await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, s.sessionId)))[0]!.policyVersion).toBe('agency:v1')
    expect(await db.select().from(relationships).where(eq(relationships.sessionId, s.sessionId))).toEqual(before)
    expect(await db.select().from(memories).where(eq(memories.sessionId, s.sessionId))).toEqual(stored)
    expect((await db.select().from(messages).where(eq(messages.id, message!.id)))[0]!.content).toBe('나는 따뜻한 우유를 좋아해.')
    expect(await db.select().from(stateTransitions).where(and(eq(stateTransitions.sessionId, s.sessionId), eq(stateTransitions.rule, 'relationship_experience_adoption')))).toHaveLength(1)
  })
  it('does not change another user’s session or enable an ordinary chat character', async () => {
    const s = await fixture(), other = await fixture(), chat = await fixture('chat')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'live'); vi.stubEnv('MIRO_AGENCY_DEFAULT_POLICY', 'agency:v1')
    expect(await adoptRelationshipPolicy(s.sessionId, other.userId)).toBeNull()
    expect(await adoptRelationshipPolicy(chat.sessionId, chat.userId)).toBeNull()
    expect((await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, chat.sessionId)))[0]!.policyVersion).toBe('legacy:v1')
  })
})
