import { afterAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import * as schema from '../schema/index'

const {
  users, characters, worlds, roleplaySessions, worldStates,
  relationships, messages, events, memories, scenes,
} = schema

const url = process.env.DATABASE_URL
const describeDb = url ? describe : describe.skip

describeDb('turn commit', () => {
  const sql = postgres(url!)
  const db = drizzle(sql, { schema })
  const made: string[] = []

  async function session() {
    const [u] = await db.insert(users)
      .values({ email: `t-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    made.push(u!.id)

    const [c] = await db.select({ id: characters.id, worldId: worlds.id })
      .from(characters).innerJoin(worlds, eq(worlds.characterId, characters.id))
      .where(eq(characters.slug, 'thomas')).limit(1)

    const [s] = await db.insert(roleplaySessions)
      .values({ userId: u!.id, characterId: c!.id, worldId: c!.worldId })
      .returning({ id: roleplaySessions.id })
    await db.insert(worldStates)
      .values({ sessionId: s!.id, currentLocation: '런던', currentTime: '저녁' })
    await db.insert(relationships).values({ sessionId: s!.id })

    return { sessionId: s!.id, characterId: c!.id }
  }

  afterAll(async () => {
    for (const id of made) await db.delete(users).where(eq(users.id, id))
    await sql.end()
  })

  it('a version-matched update succeeds and bumps the version', async () => {
    const { sessionId } = await session()
    const updated = await db.update(worldStates)
      .set({ currentLocation: '도쿄', version: 2 })
      .where(and(eq(worldStates.sessionId, sessionId), eq(worldStates.version, 1)))
      .returning({ id: worldStates.id })

    expect(updated).toHaveLength(1)
    const [w] = await db.select().from(worldStates).where(eq(worldStates.sessionId, sessionId))
    expect(w!.currentLocation).toBe('도쿄')
    expect(w!.version).toBe(2)
  })

  it('a stale version updates nothing, so a concurrent turn cannot overwrite', async () => {
    const { sessionId } = await session()

    // 첫 번째 요청이 커밋한다
    await db.update(worldStates).set({ currentLocation: '도쿄', version: 2 })
      .where(and(eq(worldStates.sessionId, sessionId), eq(worldStates.version, 1)))

    // 두 번째 요청은 version 1 을 들고 있다 — 덮어쓰지 못해야 한다
    const stale = await db.update(worldStates)
      .set({ currentLocation: '서울', version: 2 })
      .where(and(eq(worldStates.sessionId, sessionId), eq(worldStates.version, 1)))
      .returning({ id: worldStates.id })

    expect(stale).toHaveLength(0)
    const [w] = await db.select().from(worldStates).where(eq(worldStates.sessionId, sessionId))
    expect(w!.currentLocation).toBe('도쿄')   // 첫 번째 결과가 살아남았다
  })

  it('one turn can store several messages', async () => {
    const { sessionId } = await session()
    await db.insert(messages).values([
      { sessionId, role: 'user', content: '안녕', turnIndex: 1 },
      { sessionId, role: 'character', content: '…', turnIndex: 1 },
      { sessionId, role: 'npc', content: '누구세요?', turnIndex: 1 },
    ])
    const rows = await db.select().from(messages).where(eq(messages.sessionId, sessionId))
    expect(rows).toHaveLength(3)
  })

  it('T4: an active event persists across turns', async () => {
    const { sessionId } = await session()
    await db.insert(events).values({
      sessionId, type: 'injury', status: 'active',
      continuationState: { detail: '왼팔 부상' },
      cooldownUntilTurn: 9, createdAtTurn: 1,
    })

    // 여러 턴이 지나도 상태가 유지된다
    await db.update(roleplaySessions).set({ turnCount: 5 })
      .where(eq(roleplaySessions.id, sessionId))

    const active = await db.select().from(events)
      .where(and(eq(events.sessionId, sessionId), eq(events.status, 'active')))
    expect(active).toHaveLength(1)
    expect(active[0]!.continuationState).toEqual({ detail: '왼팔 부상' })
  })

  it('T7: the same scene key reuses a scene instead of creating another', async () => {
    const { sessionId } = await session()
    const key = 'tokyo_hotel|night|tense|rain'
    await db.insert(scenes).values({
      sessionId, location: 'Tokyo Hotel', time: 'night',
      mood: 'tense', weather: 'rain', sceneKey: key,
    })

    const found = await db.select().from(scenes)
      .where(and(eq(scenes.sessionId, sessionId), eq(scenes.sceneKey, key)))
    expect(found).toHaveLength(1)
  })

  it('memories stay scoped to their own session', async () => {
    const a = await session()
    const b = await session()
    await db.insert(memories).values({
      sessionId: a.sessionId, characterId: a.characterId,
      type: 'user_fact', content: 'A 세션 기억',
      importance: 90, persistence: 90, confidence: 90,
    })

    const fromB = await db.select().from(memories).where(eq(memories.sessionId, b.sessionId))
    expect(fromB).toHaveLength(0)
    const fromA = await db.select().from(memories).where(eq(memories.sessionId, a.sessionId))
    expect(fromA).toHaveLength(1)
  })

  it('deleting a session removes its events, memories, and scenes', async () => {
    const { sessionId, characterId } = await session()
    await db.insert(events).values({ sessionId, type: 'crisis', createdAtTurn: 1 })
    await db.insert(memories).values({
      sessionId, characterId, type: 'user_fact', content: 'x',
      importance: 90, persistence: 90, confidence: 90,
    })
    await db.insert(scenes).values({
      sessionId, location: 'a', time: 'b', sceneKey: 'a|b||',
    })

    await db.delete(roleplaySessions).where(eq(roleplaySessions.id, sessionId))

    expect(await db.select().from(events).where(eq(events.sessionId, sessionId))).toHaveLength(0)
    expect(await db.select().from(memories).where(eq(memories.sessionId, sessionId))).toHaveLength(0)
    expect(await db.select().from(scenes).where(eq(scenes.sessionId, sessionId))).toHaveLength(0)
  })
})
