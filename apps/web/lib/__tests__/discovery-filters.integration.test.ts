import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db, characters, users, worlds } from '@miro/db'
import { homeCatalog } from '../home'
import { availableDiscoveryGroups, discoveryOptionCounts, discoveryTags } from '../discovery-filters'

describe('discovery filter input', () => {
  it('rejects unknown, malformed and excessive tags while allowing authored namespaced metadata', () => {
    expect(discoveryTags(['로맨스', 'not-a-catalog-tag'])).toBeNull()
    expect(discoveryTags(Array(33).fill('로맨스'))).toBeNull()
    expect(discoveryTags(['unknown:로맨스'])).toBeNull()
    expect(discoveryTags(['mood:'])).toBeNull()
    expect(discoveryTags(['mood:a:b'])).toBeNull()
    expect(discoveryTags(['character:고서 복원가'])).toEqual(['character:고서 복원가'])
    expect(discoveryTags(['로맨스', '로맨스'])).toEqual(['로맨스'])
  })
  it('offers broad genres and professions/species, while keeping empty role groups hidden', () => {
    const groups = availableDiscoveryGroups([{ genre: '현대 드라마 · 미스터리', occupation: '고서 복원가', relationshipKeywords: ['거리를 두는', '오래된 비밀'] }])
    expect(groups.find(group => group.id === 'mood')!.tags).toEqual(expect.arrayContaining(['mood:판타지', 'mood:SF', 'mood:미스터리']))
    expect(groups.find(group => group.id === 'character')!.tags).toEqual(expect.arrayContaining(['character:복원가', 'character:기사', 'character:엘프', 'character:연금술사']))
    expect(groups.find(group => group.id === 'character')!.tags).not.toContain('character:고서 복원가')
    expect(groups.find(group => group.id === 'relation')!.tags).toEqual(expect.arrayContaining(['relation:다정한', 'relation:비밀스러운', 'relation:집착하는', 'relation:츤데레']))
    expect(groups.find(group => group.id === 'relation')!.tags).not.toContain('relation:오래된 비밀')
    expect(groups.some(group => group.id === 'gong' || group.id === 'su')).toBe(false)
    expect(availableDiscoveryGroups([{ genre: null, occupation: null, relationshipKeywords: ['다정공', '복수'] }]).map(group => group.id)).toEqual(['mood', 'character', 'gong', 'relation'])
  })
  it('ranks popular tags using observed conversation counts and never invents badges without usage', () => {
    const card = { genre: '현대 드라마', occupation: '고서 복원가', relationshipKeywords: ['오래된 비밀'], plays: 7 }
    const groups = availableDiscoveryGroups([card])
    expect(groups.find(group => group.id === 'character')!.tags[0]).toBe('character:복원가')
    expect(groups.find(group => group.id === 'character')!.popularTags).toEqual(['character:복원가'])
    expect(groups.find(group => group.id === 'relation')!.popularTags).toEqual(['relation:비밀스러운'])
    expect(availableDiscoveryGroups([{ ...card, plays: 0 }]).every(group => !group.popularTags?.length)).toBe(true)
  })
  it('counts each facet against the keyword and other groups, retaining alternatives within its own group', () => {
    const catalog = [
      { name: '토마스', genre: '현대 드라마', occupation: '복원가', relationshipKeywords: ['오래된 비밀'] },
      { name: '유진', genre: '현대 일상', occupation: '대학원생', relationshipKeywords: ['다정한'] },
      { name: '태윤', genre: '현대 드라마', occupation: '지배인', relationshipKeywords: ['다정한'] },
    ]
    const groups = availableDiscoveryGroups(catalog)
    const counts = discoveryOptionCounts(catalog, groups, ['mood:드라마', 'character:복원가', 'character:학생'])
    expect(counts['character:학생']).toBe(0)
    expect(counts['character:복원가']).toBe(1)
    expect(counts['character:지배인']).toBe(1)
    expect(counts['mood:일상']).toBe(1)
    expect(counts['relation:다정한']).toBe(0)
    expect(counts['relation:비밀스러운']).toBe(1)
    expect(discoveryOptionCounts(catalog, groups, [], '토마스')['character:복원가']).toBe(1)
    expect(discoveryOptionCounts(catalog, groups, [], '토마스')['character:지배인']).toBe(0)
    expect(discoveryOptionCounts(catalog, groups, [], '복원가')['character:복원가']).toBe(0)
  })
})

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
describeDb('discovery catalog matching and visibility', () => {
  const owners: string[] = [], records: string[] = []
  afterAll(async () => {
    if (records.length) {
      await db.delete(worlds).where(inArray(worlds.characterId, records))
      await db.delete(characters).where(inArray(characters.id, records))
    }
    for (const id of owners) await db.delete(users).where(eq(users.id, id))
  })
  it('matches alternatives within groups, all chosen groups and audience without leaking private or deleted characters', async () => {
    const marker = `discovery-${randomUUID().slice(0, 8)}`
    const [owner, other] = await db.insert(users).values([{ email: `${marker}@example.test` }, { email: `${marker}-other@example.test` }]).returning()
    owners.push(owner!.id, other!.id)
    async function make(role: string, audience: 'female' | 'male', options: { ownerId?: string; isPublic?: boolean; deletedAt?: Date } = {}) {
      const [row] = await db.insert(characters).values({
        ownerId: options.ownerId ?? owner!.id, name: marker, personality: 'test', role, audience, age: '30',
        experienceType: 'reality', isDraft: false, isPublic: options.isPublic ?? true, deletedAt: options.deletedAt,
      }).returning()
      records.push(row!.id)
      await db.insert(worlds).values({ characterId: row!.id, genre: '현대 로맨스' })
      return row!.id
    }
    const first = await make('능력공 가이드버스', 'female')
    await db.update(characters).set({ occupation: '고서 복원가', tagline: '오래된 비밀을 지키는' }).where(eq(characters.id, first))
    const second = await make('다정공 가이드버스', 'female', { isPublic: false })
    await make('능력공 가이드버스', 'male')
    await make('능력공 일상', 'female')
    await make('능력공 가이드버스', 'female', { ownerId: other!.id, isPublic: false })
    await make('능력공 가이드버스', 'female', { deletedAt: new Date() })
    const filter = { query: marker, audience: 'female' as const, tags: ['능력공', '다정공', '가이드버스'] }
    expect(new Set((await homeCatalog(owner!.id, filter)).items.map(row => row.id))).toEqual(new Set([first, second]))
    expect((await homeCatalog(null, filter)).items.map(row => row.id)).toEqual([first])
    expect((await homeCatalog(null, { query: marker, tags: ['현대물', '능력공'], audience: 'male' })).items).toHaveLength(1)
    const visible = (await homeCatalog(null, { query: marker })).items
    const available = availableDiscoveryGroups(visible)
    expect(available.some(group => group.id === 'su')).toBe(false)
    expect((await homeCatalog(null, { query: marker, tags: ['mood:현대 로맨스', 'gong:능력공', 'relation:가이드버스'], audience: 'female' })).items.map(row => row.id)).toEqual([first])
    expect((await homeCatalog(null, { query: marker, tags: ['mood:현대물', 'character:복원가'], audience: 'female' })).items.map(row => row.id)).toEqual([first])
    expect((await homeCatalog(null, { query: marker, tags: ['relation:비밀스러운'], audience: 'female' })).items.map(row => row.id)).toEqual([first])
  })
})
