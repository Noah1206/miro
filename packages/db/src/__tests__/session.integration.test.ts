import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import * as schema from '../schema/index'

const { users, characters, worlds, roleplaySessions, worldStates, relationships } = schema

const url = process.env.DATABASE_URL
const describeDb = url ? describe : describe.skip

describeDb('roleplay session creation', () => {
  const sql = postgres(url!)
  const db = drizzle(sql, { schema })
  const created: string[] = []

  async function makeUser() {
    const [u] = await db.insert(users)
      .values({ email: `s-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    created.push(u!.id)
    return u!.id
  }

  /** actions.ts 의 startRoleplay 와 동일한 세션 생성 절차. 상태는 DB 에서 읽는다. */
  async function startSession(userId: string, slug: string) {
    const [c] = await db
      .select({
        id: characters.id,
        worldId: worlds.id,
        worldLocation: worlds.location,
        startingTime: characters.startingTime,
        initialRelationship: characters.initialRelationship,
      })
      .from(characters).innerJoin(worlds, eq(worlds.characterId, characters.id))
      .where(eq(characters.slug, slug)).limit(1)

    return db.transaction(async (tx) => {
      const [s] = await tx.insert(roleplaySessions)
        .values({ userId, characterId: c!.id, worldId: c!.worldId })
        .returning({ id: roleplaySessions.id })
      await tx.insert(worldStates).values({
        sessionId: s!.id,
        currentLocation: c!.worldLocation ?? '알 수 없는 장소',
        currentTime: c!.startingTime,
      })
      await tx.insert(relationships).values({ sessionId: s!.id, ...c!.initialRelationship })
      return s!.id
    })
  }

  beforeAll(async () => {
    const seeded = await db.select().from(characters).where(eq(characters.isOfficial, true))
    expect(seeded.length).toBe(3) // seed 가 먼저 실행되어 있어야 한다
  })

  afterAll(async () => {
    for (const id of created) await db.delete(users).where(eq(users.id, id))
    await sql.end()
  })

  it('creates world and relationship state alongside the session', async () => {
    const userId = await makeUser()
    const sessionId = await startSession(userId, 'thomas')

    const [w] = await db.select().from(worldStates).where(eq(worldStates.sessionId, sessionId))
    const [r] = await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))

    expect(w!.currentLocation).toBe('런던 구시가지')
    expect(w!.version).toBe(1)
    expect(r!.stage).toBe('stranger')
  })

  it('characters do not start out fond of the user', async () => {
    const userId = await makeUser()
    const sessionId = await startSession(userId, 'thomas')
    const [r] = await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))

    expect(r!.attraction).toBeLessThan(20)
    expect(r!.emotionalDistance).toBeGreaterThan(60)
    expect(r!.stage).not.toBe('lover')
  })

  it('two users get independent relationships with the same character', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const sa = await startSession(a, 'taeyun')
    const sb = await startSession(b, 'taeyun')

    expect(sa).not.toBe(sb)

    // A 의 관계만 변화시킨다
    await db.update(relationships).set({ trust: 90, stage: 'friend' })
      .where(eq(relationships.sessionId, sa))

    const [ra] = await db.select().from(relationships).where(eq(relationships.sessionId, sa))
    const [rb] = await db.select().from(relationships).where(eq(relationships.sessionId, sb))

    expect(ra!.trust).toBe(90)
    expect(rb!.trust).toBe(30)   // B 는 영향받지 않는다
    expect(rb!.stage).toBe('professional')
  })

  it('each official character starts from a different relationship baseline', async () => {
    const userId = await makeUser()
    const stages = new Map<string, string>()
    for (const slug of ['thomas', 'taeyun', 'hisashi']) {
      const id = await startSession(userId, slug)
      const [r] = await db.select().from(relationships).where(eq(relationships.sessionId, id))
      stages.set(slug, r!.stage)
    }
    expect(stages.get('taeyun')).toBe('professional')
    expect(stages.get('hisashi')).toBe('stranger')
    // 히사시는 시작부터 보호 성향이 높다 — 캐릭터마다 다른 출발점
    const [h] = await db.select().from(relationships)
      .innerJoin(roleplaySessions, eq(roleplaySessions.id, relationships.sessionId))
      .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
      .where(and(eq(roleplaySessions.userId, userId), eq(characters.slug, 'hisashi')))
    expect(h!.relationships.protectiveness).toBeGreaterThan(30)
  })

  it('deleting a session cascades its simulation state', async () => {
    const userId = await makeUser()
    const sessionId = await startSession(userId, 'hisashi')
    await db.delete(roleplaySessions).where(eq(roleplaySessions.id, sessionId))

    const w = await db.select().from(worldStates).where(eq(worldStates.sessionId, sessionId))
    const r = await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))
    expect(w).toHaveLength(0)
    expect(r).toHaveLength(0)
  })
})
