import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, characters, contactProfiles, roleplaySessions, users, worlds } from '@miro/db'
import { testDatabaseUrl } from '../../../tooling/test-database'
import { listOfficials } from './characters'
import { discoverGrid, homePage, miroPage, popularHomeCards } from './home'

const describeDb = testDatabaseUrl(process.env.DATABASE_URL) ? describe : describe.skip

describeDb('home cards with multiple worlds', () => {
  it('selects one stable genre without duplicating cards or keyset pages', async () => {
    const [owner] = await db.insert(users).values({ email: `world-owner-${randomUUID()}@miro.dev` }).returning({ id: users.id })
    const [viewer] = await db.insert(users).values({ email: `world-viewer-${randomUUID()}@miro.dev` }).returning({ id: users.id })
    let sessionId: string | null = null
    try {
      const [chat] = await db.insert(characters).values({
        ownerId: owner!.id, name: 'two worlds chat', personality: 'test',
        isOfficial: true, isPublic: false, isDraft: false, experienceType: 'reality',
      }).returning({ id: characters.id })
      const [first] = await db.insert(worlds).values({ characterId: chat!.id, location: '첫 세계', genre: '첫세계장르' }).returning({ id: worlds.id })
      const [second] = await db.insert(worlds).values({ characterId: chat!.id, location: '둘째 세계', genre: '둘째세계장르' }).returning({ id: worlds.id })
      const selectedGenre = first!.id < second!.id ? '첫세계장르' : '둘째세계장르'
      const otherGenre = first!.id < second!.id ? '둘째세계장르' : '첫세계장르'

      const [reality] = await db.insert(characters).values({
        ownerId: owner!.id, name: 'two worlds reality', personality: 'test',
        isOfficial: false, isPublic: true, isDraft: false, experienceType: 'reality',
      }).returning({ id: characters.id })
      await db.insert(worlds).values([
        { characterId: reality!.id, location: '첫 세계', genre: '현실첫세계' },
        { characterId: reality!.id, location: '둘째 세계', genre: '현실둘째세계' },
      ])
      // 미로 목록은 앱 밖 연락이 켜진 캐릭터만 싣는다(2026-09-30).
      await db.insert(contactProfiles).values({ characterId: reality!.id, enabled: true })
      const fillers = await db.insert(characters).values(Array.from({ length: 13 }, (_, index) => ({
        ownerId: owner!.id, name: `world page filler ${index}`, personality: 'test',
        isOfficial: false, isPublic: true, isDraft: false, experienceType: 'reality' as const,
      }))).returning({ id: characters.id })

      const seen = new Set<string>()
      let homeGenre: string | null = null
      let cursor: string | null = null
      do {
        const page = await homePage(null, cursor)
        expect(page.items.length).toBeLessThanOrEqual(12)
        for (const item of page.items) {
          expect(seen.has(item.id)).toBe(false)
          seen.add(item.id)
          if (item.id === chat!.id) homeGenre = item.genre
        }
        cursor = page.nextCursor
      } while (cursor)
      expect(seen.has(chat!.id)).toBe(true)
      expect(seen.has(reality!.id)).toBe(true)
      for (const filler of fillers) expect(seen.has(filler.id)).toBe(true)
      expect(homeGenre).toBe(selectedGenre)

      // 장르 칩은 어느 세계의 장르로 골라도 카드 하나 — 보이는 장르는 정해진 첫 세계 것(2026-09-30).
      const filtered = await homePage(viewer!.id, null, [otherGenre])
      expect(filtered.items.filter(item => item.id === chat!.id)).toHaveLength(1)
      expect(filtered.items.find(item => item.id === chat!.id)?.genre).toBe(selectedGenre)
      expect((await listOfficials('reality')).filter(item => item.id === chat!.id)).toHaveLength(1)
      expect((await discoverGrid(viewer!.id, 'reality')).filter(item => item.id === chat!.id)).toHaveLength(1)
      // 채움 캐릭터도 미로라 첫 페이지를 넘길 수 있다 — 끝까지 넘겨 한 번만 나오는지 본다.
      const miroIds: string[] = []
      for (let next: string | null = null; ; ) {
        const page: { items: { id: string }[]; nextCursor: string | null } = await miroPage(viewer!.id, next)
        miroIds.push(...page.items.map(item => item.id))
        if (!(next = page.nextCursor)) break
      }
      expect(miroIds.filter(id => id === reality!.id)).toHaveLength(1)

      const [session] = await db.insert(roleplaySessions).values({
        userId: viewer!.id, characterId: chat!.id, worldId: first!.id,
      }).returning({ id: roleplaySessions.id })
      sessionId = session!.id
      expect((await popularHomeCards()).filter(item => item.id === chat!.id)).toHaveLength(1)
    } finally {
      if (sessionId) await db.delete(roleplaySessions).where(eq(roleplaySessions.id, sessionId))
      await db.delete(users).where(eq(users.id, viewer!.id))
      await db.delete(users).where(eq(users.id, owner!.id))
    }
  }, 15000)
})
