import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users, characters, contactProfiles, roleplaySessions, messages, callSessions, characterRevisions, worlds } from '@miro/db'
import { createRoleplaySession } from '@/lib/simulation/start'
import { saveCharacter } from '../actions'
import { updateCharacter } from '../../my/characters/[id]/edit/actions'
import { runRealityEvaluations } from '@/lib/reality/scheduler'
import { evaluateSession } from '@/lib/reality/evaluate'
import { startIncomingCall } from '@/lib/call/service'
import { loadSession } from '@/lib/simulation/snapshot'
import { buildContext } from '@miro/engine'
import { testDatabaseUrl } from '../../../../../../tooling/test-database'

const auth = vi.hoisted(() => ({ userId: '' }))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: auth.userId }) }))
vi.mock('@/lib/storage/images', () => ({ resolveCharacterImages: async () => [] }))
vi.mock('@/lib/analytics/track', () => ({ track: async () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) }, notFound: () => { throw new Error('NOT_FOUND') } }))

const describeDb = testDatabaseUrl(process.env.DATABASE_URL) ? describe : describe.skip
const made: string[] = []
afterAll(async () => { for (const id of made) { await db.delete(characters).where(eq(characters.ownerId, id)); await db.delete(users).where(eq(users.id, id)) } })
function form(enabled = true) {
  const fd = new FormData()
  for (const [k, v] of Object.entries({ creationId: randomUUID(), experienceType: 'reality', name: 'UX Test', title: 'hello', personality: 'calm', startingContext: 'at home', trust: '37', contactFrequency: '63', photoProbability: '17', introDialogue: '[{"role":"character","text":"안녕"}]' })) fd.set(k, v)
  if (enabled) fd.set('contactEnabled', 'on')
  return fd
}
async function create(enabled = true) {
  const [u] = await db.insert(users).values({ email: `creator-${randomUUID()}@example.test` }).returning()
  auth.userId = u!.id; made.push(u!.id)
  expect(await saveCharacter(form(enabled))).toMatch(/^\/chat\//)
  const [c] = await db.select().from(characters).where(eq(characters.ownerId, u!.id))
  const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.characterId, c!.id))
  return { c: c!, session: session!, userId: u!.id }
}
describeDb('creator Reality wiring', () => {
  // 2026-09-29: 앱은 미로 캐릭터만 만든다. 일반 캐릭터 만들기는 서버가 거부하고, 이미 있는 일반 캐릭터는 편집·대화만 이어진다.
  it('refuses to create a standard chat character; an existing one keeps its prompt, stays out of Reality and edits as chat', async () => {
    const [owner] = await db.insert(users).values({ email: `standard-${randomUUID()}@example.test` }).returning()
    auth.userId = owner!.id; made.push(owner!.id)
    const creationId = randomUUID()
    const standard = new FormData()
    for (const [key, value] of Object.entries({ creationId, experienceType: 'chat', name: '대화 친구', title: '서점에서 만난 사람',
      personality: '조용하지만 다정하고, 짧은 존댓말로 답한다.', startingContext: '비 오는 날 서점에서 처음 만났다.',
      introDialogue: '[{"role":"character","text":"어서 오세요."}]' })) standard.set(key, value)
    await expect(saveCharacter(standard)).rejects.toThrow('CHARACTER_TYPE_IMMUTABLE')
    expect(await db.select().from(characters).where(eq(characters.ownerId, owner!.id))).toHaveLength(0)

    // 결정 전에 만들어진 일반 캐릭터(직접 넣는다).
    await db.insert(characters).values({ id: creationId, ownerId: owner!.id, experienceType: 'chat', isDraft: false, isPublic: false,
      name: '대화 친구', personality: '조용하지만 다정하고, 짧은 존댓말로 답한다.', startingContext: '비 오는 날 서점에서 처음 만났다.' })
    await db.insert(worlds).values({ characterId: creationId, location: '서점' })
    await db.insert(contactProfiles).values({ characterId: creationId, enabled: false })
    const { sessionId } = await createRoleplaySession(owner!.id, creationId)
    const loaded = await loadSession(sessionId, owner!.id)
    expect(loaded!.snapshot.experienceType).toBe('chat')
    const prompt = buildContext(loaded!.snapshot)
    expect(prompt.system).toContain('짧은 존댓말')
    expect(prompt.system).toContain('비 오는 날 서점')
    expect(await evaluateSession(sessionId, new Date(), { inline: true })).toMatchObject({ outcome: 'skipped' })
    expect(await startIncomingCall(sessionId, 'voice', 'test')).toBeNull()
    const edited = new FormData()
    standard.forEach((value, key) => edited.append(key, value))
    edited.set('personality', '활기차고, 반말로 친근하게 답한다.')
    expect(await updateCharacter(creationId, edited)).toBe(`/character/${creationId}`)
    expect((await db.select().from(characters).where(eq(characters.id, creationId)))[0]).toMatchObject({ experienceType: 'chat', personality: '활기차고, 반말로 친근하게 답한다.' })
    edited.set('contactEnabled', 'on')
    await expect(updateCharacter(creationId, edited)).rejects.toThrow('CHARACTER_TYPE_SETTINGS_INVALID')
    expect(await db.select().from(characterRevisions).where(eq(characterRevisions.characterId, creationId))).toHaveLength(0)
  })
  it('persists Reality, intro and exact settings, then stops pending contact without downgrading', async () => {
    const { c, session } = await create()
    expect(c.experienceType).toBe('reality')
    expect(c.initialRelationship.trust).toBe(37)
    expect((await db.select().from(messages).where(eq(messages.sessionId, session.id))).map(m => m.content)).toEqual(['안녕'])
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'voice_call', reason: 'test', urgency: 1 } }).where(eq(roleplaySessions.id, session.id))
    const off = form(false); off.set('contactChanged', 'on')
    expect(await updateCharacter(c.id, off)).toMatch(/^\/character\//)
    const [updated] = await db.select().from(characters).where(eq(characters.id, c.id))
    const [profile] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, c.id))
    expect(updated!.experienceType).toBe('reality')
    expect(profile).toMatchObject({ enabled: false, contactFrequency: 63, photoProbability: 17 })
    expect((await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, session.id)))[0]!.pendingRealityIntent).toBeNull()
    expect(await evaluateSession(session.id, new Date(), { inline: true })).toEqual({ outcome: 'skipped', reason: 'contact_disabled' })
    expect(await startIncomingCall(session.id, 'voice', 'test')).toBeNull()
  })
  it('does not change the saved type through contact edits', async () => {
    const { c } = await create(false)
    expect(c.experienceType).toBe('reality')
    const optIn = form(); optIn.set('experienceType', 'chat')
    await expect(updateCharacter(c.id, optIn)).rejects.toThrow('CHARACTER_TYPE_IMMUTABLE')
    expect((await db.select().from(characters).where(eq(characters.id, c.id)))[0]!.experienceType).toBe('reality')
  })
  // 받는 사람 쪽 통화 거절 설정은 없다 (2026-09-24). 켜진 기능이면 inline 통화는 울린다.
  it('has no recipient switch: an inline call rings', async () => {
    const { session } = await create()
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'voice_call', reason: 'test', urgency: 1 } }).where(eq(roleplaySessions.id, session.id))
    expect(await evaluateSession(session.id, new Date(), { inline: true })).toMatchObject({ outcome: 'sent', channel: 'voice_call' })
    expect(await db.select().from(callSessions).where(eq(callSessions.sessionId, session.id))).toHaveLength(1)
  })
  it('does not schedule a disabled character', async () => {
    const { c, session } = await create()
    await db.update(contactProfiles).set({ enabled: false }).where(eq(contactProfiles.characterId, c.id))
    await db.update(roleplaySessions).set({ lastInteractionAt: new Date(Date.now() - 7 * 86400_000), pendingRealityIntent: { channel: 'voice_call', reason: 'test', urgency: 1 } }).where(eq(roleplaySessions.id, session.id))
    await runRealityEvaluations()
    expect((await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, session.id)))[0]!.realityCheckedAt).toBeNull()
  })
  it('rejects editing a character owned by another user', async () => {
    const first = await create()
    await create()
    await expect(updateCharacter(first.c.id, form(false))).rejects.toThrow('NOT_FOUND')
  })
})
