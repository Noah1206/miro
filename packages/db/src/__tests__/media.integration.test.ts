import { afterAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import * as schema from '../schema/index'
import { buildMediaKey } from '@miro/domain'

const {
  users, characters, worlds, roleplaySessions, worldStates,
  relationships, generatedMedia, characterVisualIdentities,
} = schema

const url = process.env.DATABASE_URL
const describeDb = url ? describe : describe.skip

describeDb('media and world consistency', () => {
  const sql = postgres(url!)
  const db = drizzle(sql, { schema })
  const made: string[] = []

  /**
   * 테스트마다 고유 캐릭터를 만든다.
   * 미디어 캐시는 캐릭터 단위이므로, 공유 캐릭터를 쓰면 다른 테스트의 캐시에 적중한다
   * (그 자체는 의도된 동작이다 — 아래 별도 테스트에서 검증한다).
   */
  async function newSession() {
    const [u] = await db.insert(users)
      .values({ email: `m-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    made.push(u!.id)

    const [c] = await db.insert(characters).values({
      ownerId: u!.id, name: `테스트-${randomBytes(3).toString('hex')}`,
      personality: 'p', startingTime: '저녁',
    }).returning({ id: characters.id })

    const [w] = await db.insert(worlds)
      .values({ characterId: c!.id, location: '런던 구시가지' })
      .returning({ id: worlds.id })

    const [s] = await db.insert(roleplaySessions)
      .values({ userId: u!.id, characterId: c!.id, worldId: w!.id })
      .returning({ id: roleplaySessions.id })
    await db.insert(worldStates)
      .values({ sessionId: s!.id, currentLocation: '런던 구시가지', currentTime: '저녁' })
    await db.insert(relationships).values({ sessionId: s!.id })

    return { sessionId: s!.id, characterId: c!.id }
  }

  /** media.ts 의 getOrGenerate 와 동일한 캐시 판정. */
  async function getOrGenerate(
    sessionId: string, characterId: string, kind: 'photo' | 'background',
  ) {
    const [identity] = await db.select().from(characterVisualIdentities)
      .where(eq(characterVisualIdentities.characterId, characterId)).limit(1)

    const vi = identity ?? (await db.insert(characterVisualIdentities)
      .values({ characterId }).returning())[0]!

    const [w] = await db.select().from(worldStates)
      .where(eq(worldStates.sessionId, sessionId)).limit(1)

    const cacheKey = buildMediaKey(kind, {
      location: w!.currentLocation, time: w!.currentTime,
      mood: w!.worldStatus ?? 'neutral', outfit: '', visualVersion: vi.version,
    })

    const [hit] = await db.select().from(generatedMedia)
      .where(and(
        eq(generatedMedia.characterId, characterId),
        eq(generatedMedia.kind, kind),
        eq(generatedMedia.cacheKey, cacheKey),
      )).limit(1)

    if (hit) return { url: hit.url, cacheKey, cached: true }

    const [created] = await db.insert(generatedMedia).values({
      sessionId, characterId, kind,
      url: `/mock-media/${cacheKey.length}`, cacheKey,
      visualIdentityId: vi.id, visualIdentityVersion: vi.version,
    }).returning()
    return { url: created!.url, cacheKey, cached: false }
  }

  afterAll(async () => {
    for (const id of made) await db.delete(users).where(eq(users.id, id))
    await sql.end()
  })

  it('the same scene reuses the asset instead of generating again', async () => {
    const { sessionId, characterId } = await newSession()
    const first = await getOrGenerate(sessionId, characterId, 'photo')
    const second = await getOrGenerate(sessionId, characterId, 'photo')

    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)      // 두 번째는 생성하지 않는다 → Usage 미소비
    expect(second.url).toBe(first.url)
  })

  it('T7: moving in chat changes the photo, and moving back reuses the old asset', async () => {
    const { sessionId, characterId } = await newSession()
    const london = await getOrGenerate(sessionId, characterId, 'photo')

    // Chat 에서 도쿄로 이동
    await db.update(worldStates)
      .set({ currentLocation: '도쿄 호텔', version: 2 })
      .where(eq(worldStates.sessionId, sessionId))

    const tokyo = await getOrGenerate(sessionId, characterId, 'photo')
    expect(tokyo.cacheKey).not.toBe(london.cacheKey)
    expect(tokyo.cacheKey).toContain('도쿄_호텔')
    expect(tokyo.cached).toBe(false)

    // 런던으로 돌아오면 기존 asset 을 다시 쓴다
    await db.update(worldStates)
      .set({ currentLocation: '런던 구시가지', version: 3 })
      .where(eq(worldStates.sessionId, sessionId))

    const back = await getOrGenerate(sessionId, characterId, 'photo')
    expect(back.cached).toBe(true)
    expect(back.url).toBe(london.url)
  })

  it('photo and live scene share one visual identity', async () => {
    const { sessionId, characterId } = await newSession()
    await getOrGenerate(sessionId, characterId, 'photo')
    await getOrGenerate(sessionId, characterId, 'background')

    const rows = await db.select().from(generatedMedia)
      .where(eq(generatedMedia.characterId, characterId))

    const versions = new Set(rows.map((r) => r.visualIdentityId))
    expect(versions.size).toBe(1)   // 기능마다 다른 외형을 만들지 않는다
  })

  it('two users of one official character share the cache, but nothing user-specific', async () => {
    // 캐시 키는 외형 + 세계 조건만 담는다. 사용자 정보나 대화 내용은 들어가지 않으므로
    // 공식 캐릭터의 동일 장면 asset 을 공유해도 유출되는 것이 없다.
    const [official] = await db.select({ id: characters.id, worldId: worlds.id })
      .from(characters).innerJoin(worlds, eq(worlds.characterId, characters.id))
      .where(eq(characters.slug, 'thomas')).limit(1)

    async function sessionFor() {
      const [u] = await db.insert(users)
        .values({ email: `sh-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
      made.push(u!.id)
      const [s] = await db.insert(roleplaySessions)
        .values({ userId: u!.id, characterId: official!.id, worldId: official!.worldId })
        .returning({ id: roleplaySessions.id })
      await db.insert(worldStates)
        .values({ sessionId: s!.id, currentLocation: '공유장면', currentTime: '새벽' })
      await db.insert(relationships).values({ sessionId: s!.id })
      return s!.id
    }

    const a = await sessionFor()
    const b = await sessionFor()
    const first = await getOrGenerate(a, official!.id, 'photo')
    const second = await getOrGenerate(b, official!.id, 'photo')

    expect(second.cached).toBe(true)
    expect(second.cacheKey).not.toContain('@')          // 이메일 등 사용자 식별자 없음
    expect(second.cacheKey).toMatch(/^photo\|v\d+\|/)   // 외형 버전 + 장면 조건만
  })

  it('a user-created character never shares media with another character', async () => {
    const one = await newSession()
    const two = await newSession()
    const m1 = await getOrGenerate(one.sessionId, one.characterId, 'photo')
    const m2 = await getOrGenerate(two.sessionId, two.characterId, 'photo')

    // 캐시 키가 같아도 characterId 가 다르면 서로의 asset 을 쓰지 않는다
    expect(m1.cacheKey).toBe(m2.cacheKey)
    expect(m2.cached).toBe(false)
  })

  it('media is removed with its session', async () => {
    const { sessionId, characterId } = await newSession()
    await getOrGenerate(sessionId, characterId, 'photo')
    await db.delete(roleplaySessions).where(eq(roleplaySessions.id, sessionId))

    const left = await db.select().from(generatedMedia)
      .where(eq(generatedMedia.sessionId, sessionId))
    expect(left).toHaveLength(0)
  })
})
