import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { characters, db, roleplaySessions, users, worlds } from '@miro/db'
import { testDatabaseUrl } from '../../../tooling/test-database'
import { parseCharacterForm } from '../app/(main)/create/parse'
import { homePage, popularHomeCards } from './home'
import { searchGenres, searchNeedle } from './search-params'
import { MOODS } from './genres'

const databaseUrl = process.env.DATABASE_URL
const describeDb = databaseUrl && (() => {
  try { return !!testDatabaseUrl(databaseUrl) } catch { return false }
})() ? describe : describe.skip

/** 홈 장르 칩(2026-09-30) — 예전 검색 페이지의 장르 필터가 홈 목록(전체·인기)으로 옮겨 왔다. */
describeDb('home genre chips', () => {
  const userIds: string[] = []
  const characterIds: string[] = []
  const sessionIds: string[] = []
  const prefix = `genre-${randomUUID().slice(0, 8)}`

  afterAll(async () => {
    for (const id of sessionIds) await db.delete(roleplaySessions).where(eq(roleplaySessions.id, id))
    for (const id of characterIds) await db.delete(characters).where(eq(characters.id, id))
    for (const id of userIds) await db.delete(users).where(eq(users.id, id))
  })

  async function user() {
    const [row] = await db.insert(users).values({ email: `${randomUUID()}@test.invalid` }).returning({ id: users.id })
    userIds.push(row!.id)
    return row!.id
  }

  async function character(ownerId: string, name: string, type: 'chat' | 'reality', values: Partial<typeof characters.$inferInsert> = {}) {
    const [row] = await db.insert(characters).values({ ownerId, name, experienceType: type, personality: 'test', isPublic: true, ...values }).returning({ id: characters.id })
    characterIds.push(row!.id)
    return row!.id
  }

  it('finds chosen genres inside combined world genres without keyword leakage or keyset duplication', async () => {
    const owner = await user()
    const viewer = await user()
    const genreA = `${prefix}A`
    const genreB = `${prefix}B`
    const createdName = `장르${randomUUID().slice(0, 6)}`
    const form = new FormData()
    form.set('experienceType', 'chat'); form.set('intent', 'draft')
    form.set('name', createdName)
    form.set('personality', '조용하다.')
    form.set('mood', `${genreA},${genreB}`)
    const parsed = parseCharacterForm(form)
    const created = await character(owner, parsed.character.name, 'reality', parsed.character)
    await db.insert(worlds).values({ characterId: created, ...parsed.world })
    const alternate = await character(owner, `${prefix} alternate`, 'reality')
    await db.insert(worlds).values([{ characterId: alternate, genre: genreA }, { characterId: alternate, genre: genreB }])
    // '로맨스' 칩이 '현대 로맨스 · 일상' 을 잡듯, 붙은 장르 안에 든 칩도 맞는다.
    const partial = await character(owner, `${prefix} partial`, 'reality')
    await db.insert(worlds).values({ characterId: partial, genre: `현대 ${genreA} · 일상` })
    const keywordOnly = await character(owner, `${prefix} keyword`, 'reality', { relationshipKeywords: [genreA] })
    const privateCard = await character(owner, `${prefix} private genre`, 'reality', { isPublic: false })
    await db.insert(worlds).values({ characterId: privateCard, genre: genreB })
    const oldChat = await character(owner, `${prefix} chat`, 'chat')
    await db.insert(worlds).values({ characterId: oldChat, genre: genreA })
    const createdAt = new Date('2026-09-20T00:00:00Z')
    const pageIds = await Promise.all(Array.from({ length: 13 }, async (_, index) => {
      const id = await character(owner, `${prefix} page ${index}`, 'reality', { createdAt })
      await db.insert(worlds).values({ characterId: id, genre: genreA })
      return id
    }))
    const first = await homePage(viewer, null, [genreB, genreA])
    expect(first.items).toHaveLength(12)
    expect(first.nextCursor).not.toBeNull()
    const second = await homePage(viewer, first.nextCursor, [genreA, genreA, genreB])
    const ids = [...first.items, ...second.items].map(item => item.id)
    for (const id of [created, alternate, partial, ...pageIds]) expect(ids).toContain(id)
    for (const id of [keywordOnly, privateCard, oldChat]) expect(ids).not.toContain(id)
    expect(new Set(ids).size).toBe(ids.length)
    expect((await homePage(viewer, null, [genreA])).items.map(item => item.id)).toContain(created)
    expect((await homePage(viewer, null, [genreB])).items.map(item => item.id)).toContain(created)
    expect((await homePage(owner, null, [genreB])).items.map(item => item.id)).toContain(privateCard)
    await expect(homePage(viewer, null, ['장르·혼합'])).rejects.toThrow('INVALID_GENRE')
  })

  it('ranks popular cards inside the chosen genres only', async () => {
    const owner = await user()
    const viewer = await user()
    const genre = `${prefix}P`
    const inGenre = await character(owner, `${prefix} popular in`, 'reality')
    const [inWorld] = await db.insert(worlds).values({ characterId: inGenre, genre: `드라마 · ${genre}` }).returning({ id: worlds.id })
    const outGenre = await character(owner, `${prefix} popular out`, 'reality')
    const [outWorld] = await db.insert(worlds).values({ characterId: outGenre, genre: '드라마' }).returning({ id: worlds.id })
    const sessions = await db.insert(roleplaySessions).values([
      { userId: viewer, characterId: inGenre, worldId: inWorld!.id },
      { userId: viewer, characterId: outGenre, worldId: outWorld!.id },
    ]).returning({ id: roleplaySessions.id })
    sessionIds.push(...sessions.map(row => row.id))
    const popular = (await popularHomeCards([genre])).map(item => item.id)
    expect(popular).toContain(inGenre)
    expect(popular).not.toContain(outGenre)
  })
})

describe('genre chip normalization', () => {
  it('folds spacing and case, dedupes, and rejects mixed or oversized values', () => {
    expect(searchNeedle(' 강 태 준  %_MiX ')).toBe('강태준%_mix')
    expect(searchNeedle('   ')).toBe('')
    expect(searchGenres(['느와르', '드라마', '느 와 르'])).toEqual(searchGenres(['드라마', '느와르']))
    expect(searchGenres(['Custom Genre', 'customgenre'])).toEqual(['customgenre'])
    expect(searchGenres(['장르·혼합'])).toBeNull()
    expect(searchGenres(['가'.repeat(21)])).toBeNull()
    expect(searchGenres(Array.from({ length: 21 }, (_, index) => `장르${index}`))).toBeNull()
  })

  it('accepts every displayed chip', () => {
    const genres = searchGenres([...MOODS])
    expect(genres).toHaveLength(MOODS.length)
    expect(genres).toEqual(expect.arrayContaining([...MOODS]))
  })
})
