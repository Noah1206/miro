import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { db, users, characters, worlds, messages, roleplaySessions } from '@miro/db'
import { createRoleplaySession } from './start'
import { loadSession } from './snapshot'
import { parseCharacterForm } from '@/app/(main)/create/parse'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip

describeDb('persisted chat intro', () => {
  const userIds: string[] = []
  const characterIds: string[] = []
  afterAll(async () => {
    for (const id of characterIds) await db.delete(characters).where(eq(characters.id, id))
    for (const id of userIds) await db.delete(users).where(eq(users.id, id))
  })
  async function fixture() {
    const [u] = await db.insert(users).values({ email: `intro-${randomUUID()}@example.test` }).returning()
    userIds.push(u!.id)
    const form = new FormData()
    form.set('name', 'Intro Test'); form.set('personality', 'Calm')
    form.set('sampleDialogue', JSON.stringify([{ role: 'user', text: 'legacy example' }]))
    form.set('introDialogue', JSON.stringify([{ role: 'narrator', text: 'The door opens.' }, { role: 'character', text: 'Welcome.' }]))
    const p = parseCharacterForm(form)
    const [c] = await db.insert(characters).values({ ...p.character, ownerId: u!.id, isPublic: false }).returning()
    characterIds.push(c!.id)
    await db.insert(worlds).values({ characterId: c!.id })
    return { userId: u!.id, characterId: c!.id }
  }
  it('inserts ordered intro exactly once, preserves existing sessions, and supplies AI history', async () => {
    const f = await fixture()
    const results = await Promise.all(Array.from({ length: 3 }, () => createRoleplaySession(f.userId, f.characterId)))
    expect(new Set(results.map(r => r.sessionId)).size).toBe(1)
    expect(results.filter(r => r.created)).toHaveLength(1)
    const id = results[0]!.sessionId
    const history = await db.select().from(messages).where(eq(messages.sessionId, id)).orderBy(asc(messages.turnIndex))
    expect(history.map(m => [m.role, m.content])).toEqual([['narrator', 'The door opens.'], ['character', 'Welcome.']])
    const loaded = await loadSession(id, f.userId)
    expect(JSON.stringify(loaded?.snapshot)).toContain('Welcome.')
    expect(loaded?.snapshot.character.worldRole.sampleDialogue).toEqual([{ role: 'user', text: 'legacy example' }])
    await db.update(characters).set({ sampleDialogue: [{ role: 'character', text: 'Changed intro', purpose: 'intro' }] }).where(eq(characters.id, f.characterId))
    expect((await createRoleplaySession(f.userId, f.characterId)).created).toBe(false)
    expect(await db.select().from(messages).where(eq(messages.sessionId, id))).toHaveLength(2)
    const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, id))
    expect(session!.turnCount).toBe(0)
  })
  it('enforces character access and does not promote legacy samples to opening messages', async () => {
    const f = await fixture()
    await expect(createRoleplaySession(randomUUID(), f.characterId)).rejects.toThrow('CHARACTER_NOT_FOUND')
    await db.update(characters).set({ sampleDialogue: [{ role: 'character', text: 'legacy' }] }).where(eq(characters.id, f.characterId))
    const s = await createRoleplaySession(f.userId, f.characterId)
    expect(await db.select().from(messages).where(eq(messages.sessionId, s.sessionId))).toHaveLength(0)
  })
})
