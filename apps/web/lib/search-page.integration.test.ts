import { afterAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { characters, db, users, worlds } from '@miro/db'
import { testDatabaseUrl } from '../../../tooling/test-database'
import { parseCharacterForm } from '../app/(main)/create/parse'
import { homePage, searchPage } from './home'
import { searchGenres, searchNeedle, searchQuery, searchUrl } from './search-params'

const databaseUrl = process.env.DATABASE_URL
const describeDb = databaseUrl && (() => {
  try { return !!testDatabaseUrl(databaseUrl) } catch { return false }
})() ? describe : describe.skip

describeDb('search page visibility and cursor', () => {
  const userIds: string[] = []
  const characterIds: string[] = []
  const prefix = `search-${randomUUID().slice(0, 8)}`

  afterAll(async () => {
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

  it('finds both types while preserving owner, official, draft and deletion rules', async () => {
    const owner = await user()
    const viewer = await user()
    const chat = await character(owner, `${prefix} chat`, 'chat')
    const reality = await character(owner, `${prefix} reality`, 'reality', { relationshipKeywords: ['visibleTag'] })
    const official = await character(owner, `${prefix} official`, 'reality', { isOfficial: true, isPublic: false })
    const privateCard = await character(owner, `${prefix} private`, 'reality', { isPublic: false, relationshipKeywords: ['visibleTag'] })
    const draft = await character(owner, `${prefix} draft`, 'chat', { isDraft: true })
    const deleted = await character(owner, `${prefix} deleted`, 'reality', { deletedAt: new Date() })

    for (const indexed of [false, true]) {
      const [schema] = await db.execute<{ installed: string | null }>(sql`SELECT to_regclass('miro_perf.character_search_docs')::text AS installed`)
      if (indexed && !schema?.installed) continue
      const previous = process.env.MIRO_FEATURE_INDEXED_DISCOVERY
      process.env.MIRO_FEATURE_INDEXED_DISCOVERY = indexed ? '1' : '0'
      try {
        const anonymous = (await searchPage(null, prefix)).items.map(item => item.id)
        const visible = (await searchPage(viewer, prefix)).items.map(item => item.id)
        const mine = (await searchPage(owner, prefix)).items.map(item => item.id)
        for (const id of [chat, reality, official]) {
          expect(anonymous).toContain(id)
          expect(visible).toContain(id)
          expect(mine).toContain(id)
        }
        expect(anonymous).not.toContain(privateCard)
        expect(visible).not.toContain(privateCard)
        expect(mine).toContain(privateCard)
        for (const id of [draft, deleted]) expect(mine).not.toContain(id)
        expect((await searchPage(viewer, prefix)).items.map(item => item.id)).toEqual(expect.arrayContaining([chat, reality]))
        expect((await searchPage(viewer, '', null, 'visibleTag')).items.map(item => item.id)).toEqual([reality])
        expect((await searchPage(owner, '', null, 'visibleTag')).items.map(item => item.id)).toContain(privateCard)
        expect((await homePage()).items.map(item => item.id)).not.toContain(privateCard)
      } finally {
        if (previous === undefined) delete process.env.MIRO_FEATURE_INDEXED_DISCOVERY
        else process.env.MIRO_FEATURE_INDEXED_DISCOVERY = previous
      }
    }
  })

  it('keeps keyset pages unique and rejects a cursor from another condition', async () => {
    const owner = await user()
    const viewer = await user()
    const name = `${prefix} pages`
    const createdAt = new Date('2026-09-20T00:00:00Z')
    const ids = await Promise.all(Array.from({ length: 15 }, (_, index) => character(owner, `${name} ${index}`, index % 2 ? 'chat' : 'reality', { createdAt })))
    const privateCard = await character(owner, `${name} private`, 'reality', { isPublic: false })
    const first = await searchPage(viewer, name)
    expect(first.items).toHaveLength(12)
    expect(first.nextCursor).not.toBeNull()
    const second = await searchPage(viewer, name, first.nextCursor)
    const seen = [...first.items, ...second.items].map(item => item.id)
    for (const id of ids) expect(seen).toContain(id)
    expect(new Set(seen).size).toBe(seen.length)
    expect((await searchPage(viewer, name, (await searchPage(owner, name)).nextCursor)).items.map(item => item.id)).not.toContain(privateCard)
    await expect(searchPage(viewer, `${name} different`, first.nextCursor)).rejects.toThrow('INVALID_CURSOR')
    await expect(searchPage(viewer, name, first.nextCursor, 'tag')).rejects.toThrow('INVALID_CURSOR')
    await expect(searchPage(viewer, name, first.nextCursor, null, ['느와르'])).rejects.toThrow('INVALID_CURSOR')
    expect(await searchPage(viewer, '')).toEqual({ items: [], nextCursor: null })
    expect(await searchPage(viewer, '', null, '#')).toEqual({ items: [], nextCursor: null })
    await expect(searchPage(viewer, '', first.nextCursor)).rejects.toThrow('INVALID_CURSOR')
  })

  it('normalizes Korean spacing, case, literal percent and underscore', async () => {
    const owner = await user()
    const viewer = await user()
    const id = await character(owner, `${prefix} 강 태 준 %_MiX`, 'reality')
    await db.insert(worlds).values({ characterId: id, genre: '느와르' })
    expect((await searchPage(viewer, '강태준')).items.map(item => item.id)).toContain(id)
    expect((await searchPage(viewer, '%_mix')).items.map(item => item.id)).toContain(id)
    expect((await searchPage(viewer, '느와르')).items.map(item => item.id)).toContain(id)
    expect((await searchPage(viewer, '', null, '느와르')).items.map(item => item.id)).toContain(id)
    expect((await searchPage(viewer, '', null, '와르')).items.map(item => item.id)).not.toContain(id)
    expect((await searchPage(viewer, '%Amix')).items.map(item => item.id)).not.toContain(id)
  })

  it('finds multiple exact genres across worlds without keyword leakage or keyset duplication', async () => {
    const owner = await user()
    const viewer = await user()
    const genreA = `${prefix}A`
    const genreB = `${prefix}B`
    const form = new FormData()
    form.set('name', `${prefix} created`)
    form.set('personality', '조용하다.')
    form.set('mood', `${genreA},${genreB}`)
    const parsed = parseCharacterForm(form)
    const created = await character(owner, parsed.character.name, 'chat', parsed.character)
    await db.insert(worlds).values({ characterId: created, ...parsed.world })
    const alternate = await character(owner, `${prefix} alternate`, 'reality')
    await db.insert(worlds).values([{ characterId: alternate, genre: genreA }, { characterId: alternate, genre: genreB }])
    const keywordOnly = await character(owner, `${prefix} keyword`, 'chat', { relationshipKeywords: [genreA] })
    const privateCard = await character(owner, `${prefix} private genre`, 'reality', { isPublic: false })
    await db.insert(worlds).values({ characterId: privateCard, genre: genreB })
    const createdAt = new Date('2026-09-20T00:00:00Z')
    const pageIds = await Promise.all(Array.from({ length: 13 }, async (_, index) => {
      const id = await character(owner, `${prefix} page ${index}`, 'chat', { createdAt })
      await db.insert(worlds).values({ characterId: id, genre: genreA })
      return id
    }))
    const first = await searchPage(viewer, '', null, null, [genreB, genreA])
    expect(first.items).toHaveLength(12)
    expect(first.nextCursor).not.toBeNull()
    const second = await searchPage(viewer, '', first.nextCursor, null, [genreA, genreA, genreB])
    const ids = [...first.items, ...second.items].map(item => item.id)
    for (const id of [created, alternate, ...pageIds]) expect(ids).toContain(id)
    expect(ids).not.toContain(keywordOnly)
    expect(ids).not.toContain(privateCard)
    expect(new Set(ids).size).toBe(ids.length)
    expect((await searchPage(viewer, '', null, null, [genreA])).items.map(item => item.id)).toContain(created)
    expect((await searchPage(viewer, '', null, null, [genreB])).items.map(item => item.id)).toContain(created)
    expect((await searchPage(owner, '', null, null, [genreB])).items.map(item => item.id)).toContain(privateCard)
    expect((await searchPage(viewer, `${prefix} alternate`, null, null, [genreB])).items.map(item => item.id)).toEqual([alternate])
    expect((await searchPage(viewer, `${prefix} keyword`, null, genreA, [genreA])).items).toEqual([])
    expect((await searchPage(viewer, `${prefix} created`, null, genreB, [genreA])).items.map(item => item.id)).toEqual([created])
    expect((await searchPage(viewer, '', null, genreA)).items.map(item => item.id)).toContain(keywordOnly)
    await expect(searchPage(viewer, '', first.nextCursor, null, [genreA])).rejects.toThrow('INVALID_CURSOR')
    const [schema] = await db.execute<{ installed: string | null }>(sql`SELECT to_regclass('miro_perf.character_search_docs')::text AS installed`)
    if (schema?.installed) {
      const previous = process.env.MIRO_FEATURE_INDEXED_DISCOVERY
      process.env.MIRO_FEATURE_INDEXED_DISCOVERY = '1'
      try {
        expect((await searchPage(viewer, `${prefix} created`, null, genreB, [genreA])).items.map(item => item.id)).toEqual([created])
        expect((await searchPage(viewer, `${prefix} keyword`, null, null, [genreA])).items).toEqual([])
      } finally {
        if (previous === undefined) delete process.env.MIRO_FEATURE_INDEXED_DISCOVERY
        else process.env.MIRO_FEATURE_INDEXED_DISCOVERY = previous
      }
    }
  })
})

describe('search query normalization', () => {
  it('trims to forty characters before folding whitespace and case', () => {
    expect(searchQuery(`  ${'A'.repeat(41)}  `)).toBe('A'.repeat(40))
    expect(searchNeedle(' 강 태 준  %_MiX ')).toBe('강태준%_mix')
    expect(searchNeedle('   ')).toBe('')
    expect(searchGenres(['느와르', '드라마', '느 와 르'])).toEqual(searchGenres(['드라마', '느와르']))
    expect(searchGenres(['Custom Genre', 'customgenre'])).toEqual(['customgenre'])
    expect(searchGenres(Array(6).fill(null).map((_, index) => `장르${index}`))).toBeNull()
    expect(searchGenres(['장르·혼합'])).toBeNull()
    expect(searchGenres(['가'.repeat(21)])).toBeNull()
    expect(searchUrl('/home/search', '강태준', null, ['느와르', '드라마'])).not.toContain('type=')
    expect(searchUrl('/home/search', '', null, ['느와르', '드라마', '느와르'])).toBe(searchUrl('/home/search', '', null, ['드라마', '느와르']))
  })
})
