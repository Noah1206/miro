import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, characters, characterVisualIdentities, memories, users, userSettings, worlds, roleplaySessions } from '@miro/db'
import * as providers from '@miro/providers'
import { testDatabaseUrl } from '../../../../tooling/test-database'
import { homeUnveilEnabled, setHomeUnveilFor } from '../home-mode'
import { createRoleplaySession } from '../simulation/start'
import { memoryRetriever } from '../ai/memory'
import { listSessions } from '../ops/archive'
import { loadSession } from '../simulation/snapshot'

const describeDb = testDatabaseUrl(process.env.DATABASE_URL) ? describe : describe.skip
const made: string[] = []
afterEach(() => vi.restoreAllMocks())
afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })
async function owner(verified = true) {
  const [u] = await db.insert(users).values({ email: `home-mode-${randomUUID()}@example.test`, ...(verified ? { adultVerifiedAt: new Date(), maturePolicyAgreedAt: new Date() } : {}) }).returning()
  made.push(u!.id)
  vi.spyOn(providers, 'adultModelReady').mockReturnValue(true)
  return u!.id
}
async function character(userId: string) {
  const [c] = await db.insert(characters).values({ ownerId: userId, name: '모드 분리 확인', personality: '신중한 성인 안내인', age: '30', experienceType: 'chat', startingContext: '닫히기 직전의 기록실에서 잃어버린 편지를 함께 찾는다.' }).returning()
  await db.insert(worlds).values({ characterId: c!.id })
  await db.insert(characterVisualIdentities).values({ characterId: c!.id, baseFace: { eyes: '갈색 눈' } })
  return c!
}
describeDb('home unveil consent and isolated conversations', () => {
  it('never persists an unverified browser request to enable unveil', async () => {
    const userId = await owner(false)
    expect(await setHomeUnveilFor(userId, true, true)).toMatchObject({ ok: false, reason: 'verification' })
    expect(await homeUnveilEnabled(userId)).toBe(false)
  })
  it('reuses persisted verification across off/on cycles without verifying again', async () => {
    const userId = await owner()
    expect(await setHomeUnveilFor(userId, true)).toMatchObject({ ok: true, enabled: true })
    expect(await setHomeUnveilFor(userId, false)).toMatchObject({ ok: true, enabled: false })
    expect(await setHomeUnveilFor(userId, true)).toMatchObject({ ok: true, enabled: true })
    expect(await homeUnveilEnabled(userId)).toBe(true)
    await db.update(users).set({ adultVerifiedAt: null }).where(eq(users.id, userId))
    expect(await homeUnveilEnabled(userId)).toBe(false)
  })
  it('separates session IDs, memories, archive and direct access, and re-enters each existing conversation', async () => {
    const userId = await owner(), c = await character(userId)
    const normal = await createRoleplaySession(userId, c.id)
    await db.insert(memories).values({ sessionId: normal.sessionId, characterId: c.id, type: 'fact', content: '일반에서만 나눈 약속', importance: 90, persistence: 90, confidence: 90 })
    await setHomeUnveilFor(userId, true)
    const adult = await createRoleplaySession(userId, c.id)
    expect(adult.sessionId).not.toBe(normal.sessionId)
    expect((await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, adult.sessionId)))[0]).toMatchObject({ adultMode: true, adultLevel: 'explicit' })
    expect(await memoryRetriever.retrieve({ sessionId: adult.sessionId, userId, query: '약속', limit: 10 })).toEqual([])
    expect((await listSessions(userId)).items.map(i => i.id)).toEqual([adult.sessionId])
    expect(await loadSession(normal.sessionId, userId)).toBeNull()
    expect((await createRoleplaySession(userId, c.id)).sessionId).toBe(adult.sessionId)
    await setHomeUnveilFor(userId, false)
    expect((await createRoleplaySession(userId, c.id)).sessionId).toBe(normal.sessionId)
    expect((await listSessions(userId)).items.map(i => i.id)).toEqual([normal.sessionId])
    expect(await loadSession(adult.sessionId, userId)).toBeNull()
    expect((await memoryRetriever.retrieve({ sessionId: normal.sessionId, userId, query: '약속', limit: 10 }))[0]!.content).toBe('일반에서만 나눈 약속')
  })
  it('concurrent entries create one conversation per mode', async () => {
    const userId = await owner(), c = await character(userId)
    await setHomeUnveilFor(userId, true)
    const runs = await Promise.all([createRoleplaySession(userId, c.id), createRoleplaySession(userId, c.id)])
    expect(new Set(runs.map(r => r.sessionId)).size).toBe(1)
  })
  it('cannot enter an underage character in unveil', async () => {
    const userId = await owner(), c = await character(userId)
    await db.update(characters).set({ age: '16' }).where(eq(characters.id, c.id))
    await setHomeUnveilFor(userId, true)
    await expect(createRoleplaySession(userId, c.id)).rejects.toThrow('UNVEIL_UNAVAILABLE')
  })
})
