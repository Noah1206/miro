import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users, userSettings, characters, contactProfiles, roleplaySessions, messages, callSessions } from '@miro/db'
import { saveCharacter } from '../actions'
import { updateCharacter } from '../../my/characters/[id]/edit/actions'
import { runRealityEvaluations } from '@/lib/reality/scheduler'
import { evaluateSession } from '@/lib/reality/evaluate'
import { startIncomingCall } from '@/lib/call/service'

const auth = vi.hoisted(() => ({ userId: '' }))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: auth.userId }) }))
vi.mock('@/lib/storage/images', () => ({ resolveCharacterImages: async () => [] }))
vi.mock('@/lib/analytics/track', () => ({ track: async () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) }, notFound: () => { throw new Error('NOT_FOUND') } }))

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const made: string[] = []
afterAll(async () => { for (const id of made) { await db.delete(characters).where(eq(characters.ownerId, id)); await db.delete(users).where(eq(users.id, id)) } })
function form(enabled = true) {
  const fd = new FormData()
  for (const [k, v] of Object.entries({ name: 'UX Test', title: 'hello', personality: 'calm', startingContext: 'at home', trust: '37', contactFrequency: '63', photoProbability: '17', introDialogue: '[{"role":"character","text":"안녕"}]' })) fd.set(k, v)
  if (enabled) fd.set('contactEnabled', 'on')
  return fd
}
async function create(enabled = true) {
  const [u] = await db.insert(users).values({ email: `creator-${randomUUID()}@example.test` }).returning()
  auth.userId = u!.id; made.push(u!.id)
  await db.insert(userSettings).values({ userId: u!.id, quietHoursEnabled: false, voiceCallEnabled: false, videoCallEnabled: false })
  await expect(saveCharacter(form(enabled))).rejects.toThrow('REDIRECT:/chat/')
  const [c] = await db.select().from(characters).where(eq(characters.ownerId, u!.id))
  const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.characterId, c!.id))
  return { c: c!, session: session!, userId: u!.id }
}
describeDb('creator Reality wiring', () => {
  it('persists Reality, intro and exact settings, then stops pending contact without downgrading', async () => {
    const { c, session } = await create()
    expect(c.experienceType).toBe('reality')
    expect(c.initialRelationship.trust).toBe(37)
    expect((await db.select().from(messages).where(eq(messages.sessionId, session.id))).map(m => m.content)).toEqual(['안녕'])
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'voice_call', reason: 'test', urgency: 1 } }).where(eq(roleplaySessions.id, session.id))
    const off = form(false); off.set('contactChanged', 'on')
    await expect(updateCharacter(c.id, off)).rejects.toThrow('REDIRECT:/character/')
    const [updated] = await db.select().from(characters).where(eq(characters.id, c.id))
    const [profile] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, c.id))
    expect(updated!.experienceType).toBe('reality')
    expect(profile).toMatchObject({ enabled: false, contactFrequency: 63, photoProbability: 17 })
    expect((await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, session.id)))[0]!.pendingRealityIntent).toBeNull()
    expect(await evaluateSession(session.id, new Date(), { inline: true })).toEqual({ outcome: 'skipped', reason: 'contact_disabled' })
    expect(await startIncomingCall(session.id, 'voice', 'test')).toBeNull()
  })
  it('does not silently promote a legacy chat, but supports explicit opt-in', async () => {
    const { c } = await create(false)
    expect(c.experienceType).toBe('chat')
    await expect(updateCharacter(c.id, form())).rejects.toThrow('REDIRECT:')
    expect((await db.select().from(characters).where(eq(characters.id, c.id)))[0]!.experienceType).toBe('chat')
    const optIn = form(); optIn.set('contactChanged', 'on')
    await expect(updateCharacter(c.id, optIn)).rejects.toThrow('REDIRECT:')
    expect((await db.select().from(characters).where(eq(characters.id, c.id)))[0]!.experienceType).toBe('reality')
  })
  it('respects recipient call preferences even for inline contact', async () => {
    const { session } = await create()
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'voice_call', reason: 'test', urgency: 1 } }).where(eq(roleplaySessions.id, session.id))
    expect(await evaluateSession(session.id, new Date(), { inline: true })).toEqual({ outcome: 'suppressed', reason: 'channel_disabled' })
    expect(await db.select().from(callSessions).where(eq(callSessions.sessionId, session.id))).toHaveLength(0)
  })
  it('does not schedule a disabled character and respects quiet hours for inline calls', async () => {
    const { c, session, userId } = await create()
    await db.update(contactProfiles).set({ enabled: false }).where(eq(contactProfiles.characterId, c.id))
    await db.update(roleplaySessions).set({ lastInteractionAt: new Date(Date.now() - 7 * 86400_000), pendingRealityIntent: { channel: 'voice_call', reason: 'test', urgency: 1 } }).where(eq(roleplaySessions.id, session.id))
    await runRealityEvaluations()
    expect((await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, session.id)))[0]!.realityCheckedAt).toBeNull()
    await db.update(contactProfiles).set({ enabled: true }).where(eq(contactProfiles.characterId, c.id))
    await db.update(userSettings).set({ voiceCallEnabled: true, quietHoursEnabled: true, quietHoursStart: '23:00', quietHoursEnd: '08:00', timeZone: 'Asia/Seoul' }).where(eq(userSettings.userId, userId))
    expect(await evaluateSession(session.id, new Date('2026-09-23T02:00:00+09:00'), { inline: true })).toEqual({ outcome: 'suppressed', reason: 'quiet_hours' })
  })
  it('rejects editing a character owned by another user', async () => {
    const first = await create()
    await create()
    await expect(updateCharacter(first.c.id, form(false))).rejects.toThrow('NOT_FOUND')
  })
})
