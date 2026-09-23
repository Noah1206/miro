import { afterAll, describe, expect, it } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { characters, db, roleplaySessions, users, worlds } from '@miro/db'
import { testDatabaseUrl } from '../../../tooling/test-database'
import { indexedSearchMatch, rankedPopularIds } from './search-index'

const databaseUrl = process.env.DATABASE_URL
const describeDb = databaseUrl && (() => {
  try { return !!testDatabaseUrl(databaseUrl) } catch { return false }
})() ? describe : describe.skip

describeDb('indexed discovery', () => {
  const userIds: string[] = []
  const characterIds: string[] = []
  const sessionIds: string[] = []

  afterAll(async () => {
    for (const id of sessionIds) await db.delete(roleplaySessions).where(eq(roleplaySessions.id, id))
    for (const id of characterIds) await db.delete(characters).where(eq(characters.id, id))
    for (const id of userIds) await db.delete(users).where(eq(users.id, id))
  })

  async function user() {
    const [row] = await db.insert(users).values({ email: `search-${randomUUID()}@test.invalid` }).returning({ id: users.id })
    userIds.push(row!.id)
    return row!.id
  }

  async function character(ownerId: string, name: string, isPublic = true) {
    const [row] = await db.insert(characters).values({ ownerId, name, personality: 'test', isPublic }).returning({ id: characters.id })
    characterIds.push(row!.id)
    const [world] = await db.insert(worlds).values({ characterId: row!.id, genre: '첫장르' }).returning({ id: worlds.id })
    return { id: row!.id, worldId: world!.id }
  }

  async function matched(needle: string) {
    return db.select({ id: characters.id }).from(characters).where(and(eq(characters.isPublic, true), indexedSearchMatch(needle)))
  }

  async function session(userId: string, card: { id: string; worldId: string }) {
    const [row] = await db.insert(roleplaySessions).values({ userId, characterId: card.id, worldId: card.worldId }).returning({ id: roleplaySessions.id })
    sessionIds.push(row!.id)
    return row!.id
  }

  it('tracks character and deterministically chosen world search text', async () => {
    const ownerId = await user()
    const card = await character(ownerId, '경계 테스트')
    expect((await matched('경계테스트첫장르')).some(row => row.id === card.id)).toBe(true)
    await db.update(characters).set({ name: '기호%_검사', relationshipKeywords: ['달빛', '친구'] }).where(eq(characters.id, card.id))
    expect((await matched('%_')).some(row => row.id === card.id)).toBe(true)
    expect((await matched('호%_검')).some(row => row.id === card.id)).toBe(true)
    expect((await matched('기호AB')).some(row => row.id === card.id)).toBe(false)
    expect((await matched('달빛친구')).some(row => row.id === card.id)).toBe(true)
    await db.update(worlds).set({ genre: '새장르' }).where(eq(worlds.id, card.worldId))
    expect((await matched('새장르')).some(row => row.id === card.id)).toBe(true)
    expect((await matched('첫장르')).some(row => row.id === card.id)).toBe(false)
    const alternateWorldId = randomUUID()
    await db.insert(worlds).values({ id: alternateWorldId, characterId: card.id, genre: '다른장르' })
    expect((await matched('새장르')).some(row => row.id === card.id)).toBe(true)
    expect((await matched('다른장르')).some(row => row.id === card.id)).toBe(true)
    expect((await matched('기호%_검사다른장르')).some(row => row.id === card.id)).toBe(true)
    expect((await matched('새장르다른장르')).some(row => row.id === card.id)).toBe(false)
    await Promise.all([
      db.update(worlds).set({ genre: '동시하나' }).where(eq(worlds.id, card.worldId)),
      db.update(worlds).set({ genre: '동시둘' }).where(eq(worlds.id, alternateWorldId)),
    ])
    expect((await matched('동시하나')).some(row => row.id === card.id)).toBe(true)
    expect((await matched('동시둘')).some(row => row.id === card.id)).toBe(true)
    await db.delete(worlds).where(eq(worlds.id, card.worldId < alternateWorldId ? card.worldId : alternateWorldId))
    const remainingGenre = card.worldId < alternateWorldId ? '동시둘' : '동시하나'
    const removedGenre = card.worldId < alternateWorldId ? '동시하나' : '동시둘'
    expect((await matched(remainingGenre)).some(row => row.id === card.id)).toBe(true)
    expect((await matched(removedGenre)).some(row => row.id === card.id)).toBe(false)
  })

  it('maintains distinct active players through soft and hard deletion', async () => {
    const firstUser = await user()
    const secondUser = await user()
    const card = await character(firstUser, '인기 카드')
    const hidden = await character(firstUser, '비공개 카드', false)
    const first = await session(firstUser, card)
    const second = await session(firstUser, card)
    const third = await session(secondUser, card)
    await session(secondUser, hidden)
    expect((await rankedPopularIds()).find(row => row.character_id === card.id)?.plays).toBe(2)
    expect((await rankedPopularIds()).some(row => row.character_id === hidden.id)).toBe(false)
    await db.update(roleplaySessions).set({ deletedAt: new Date() }).where(eq(roleplaySessions.id, first))
    expect((await rankedPopularIds()).find(row => row.character_id === card.id)?.plays).toBe(2)
    await db.delete(roleplaySessions).where(eq(roleplaySessions.id, second))
    expect((await rankedPopularIds()).find(row => row.character_id === card.id)?.plays).toBe(1)
    await db.delete(roleplaySessions).where(eq(roleplaySessions.id, third))
    expect((await rankedPopularIds()).some(row => row.character_id === card.id)).toBe(false)
  })

  it('survives character and owner cascades without orphan counters', async () => {
    const ownerId = await user()
    const otherUserId = await user()
    const card = await character(ownerId, '삭제 카드')
    await session(ownerId, card)
    await session(otherUserId, card)
    await db.delete(characters).where(eq(characters.id, card.id))
    expect((await rankedPopularIds()).some(row => row.character_id === card.id)).toBe(false)
    const [orphan] = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM miro_perf.character_play_users WHERE character_id = ${card.id}`,
    )
    expect(orphan?.count).toBe(0)

    const secondCard = await character(ownerId, '계정 삭제 카드')
    await session(ownerId, secondCard)
    await db.delete(users).where(eq(users.id, ownerId))
    expect((await rankedPopularIds()).some(row => row.character_id === secondCard.id)).toBe(false)
  })

  it('serializes concurrent inserts and deletes for the same player', async () => {
    const ownerId = await user()
    const card = await character(ownerId, '경합 카드')
    const ids = await Promise.all(Array.from({ length: 4 }, () => session(ownerId, card)))
    expect((await rankedPopularIds()).find(row => row.character_id === card.id)?.plays).toBe(1)
    await db.update(roleplaySessions).set({ deletedAt: null }).where(eq(roleplaySessions.id, ids[0]!))
    expect((await rankedPopularIds()).find(row => row.character_id === card.id)?.plays).toBe(1)
    await Promise.all(ids.map(id => db.delete(roleplaySessions).where(eq(roleplaySessions.id, id))))
    expect((await rankedPopularIds()).some(row => row.character_id === card.id)).toBe(false)
  })

  it('skips old-session mutations until their character is atomically backfilled', async () => {
    const ownerId = await user()
    const otherUserId = await user()
    const card = await character(ownerId, '이전 세션 카드')
    const softDeleted = await session(ownerId, card)
    const hardDeleted = await session(ownerId, card)
    const concurrent = await session(otherUserId, card)
    await db.execute(sql`DELETE FROM miro_perf.character_backfill_state WHERE character_id = ${card.id}`)
    await db.execute(sql`DELETE FROM miro_perf.character_play_users WHERE character_id = ${card.id}`)
    await db.execute(sql`DELETE FROM miro_perf.character_play_counts WHERE character_id = ${card.id}`)
    await db.update(roleplaySessions).set({ deletedAt: new Date() }).where(eq(roleplaySessions.id, softDeleted))
    await db.delete(roleplaySessions).where(eq(roleplaySessions.id, hardDeleted))
    expect((await rankedPopularIds()).some(row => row.character_id === card.id)).toBe(false)

    let signalLocked: () => void = () => undefined
    const locked = new Promise<void>(resolve => { signalLocked = resolve })
    const deleting = db.transaction(async transaction => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(738225, hashtext(${card.id}))`)
      signalLocked()
      await sleep(50)
      await transaction.update(roleplaySessions).set({ deletedAt: new Date() }).where(eq(roleplaySessions.id, concurrent))
    })
    await locked
    const backfilling = db.execute(sql`SELECT miro_perf.backfill_character(${card.id})`)
    await Promise.all([deleting, backfilling])
    expect((await rankedPopularIds()).some(row => row.character_id === card.id)).toBe(false)
    await db.update(roleplaySessions).set({ deletedAt: null }).where(eq(roleplaySessions.id, softDeleted))
    expect((await rankedPopularIds()).find(row => row.character_id === card.id)?.plays).toBe(1)
  })

  const hotBenchmark = process.env.PERF_HOT_COUNTER === '1' ? it : it.skip
  hotBenchmark('measures hot-character distinct-player insertion', async () => {
    const ownerId = await user()
    const card = await character(ownerId, '핫 카드')
    const players = await Promise.all(Array.from({ length: 100 }, () => user()))
    const startedAt = performance.now()
    const latencies = await Promise.all(players.map(async playerId => {
      const insertStartedAt = performance.now()
      await session(playerId, card)
      return performance.now() - insertStartedAt
    }))
    const elapsedMs = performance.now() - startedAt
    latencies.sort((left, right) => left - right)
    expect((await rankedPopularIds()).find(row => row.character_id === card.id)?.plays).toBe(100)
    console.info(JSON.stringify({ hotCharacterInserts: 100, elapsedMs, insertsPerSecond: 100_000 / elapsedMs, p95Ms: latencies[94] }))
  })
})
