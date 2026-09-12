import { afterAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, eq, isNull } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import * as schema from '../schema/index'

const { users, characters } = schema

const url = process.env.DATABASE_URL
const describeDb = url ? describe : describe.skip

describeDb('character ownership', () => {
  const sql = postgres(url!)
  const db = drizzle(sql, { schema })
  const made: string[] = []

  async function user() {
    const [u] = await db.insert(users)
      .values({ email: `o-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    made.push(u!.id)
    return u!.id
  }

  /** lib/owned.ts 의 getOwnedCharacter 와 동일한 조건. */
  function ownedQuery(characterId: string, userId: string) {
    return db.select({ id: characters.id }).from(characters)
      .where(and(
        eq(characters.id, characterId),
        eq(characters.ownerId, userId),
        isNull(characters.deletedAt),
      )).limit(1)
  }

  afterAll(async () => {
    for (const id of made) await db.delete(users).where(eq(users.id, id))
    await sql.end()
  })

  it('the owner can reach their own character', async () => {
    const owner = await user()
    const [c] = await db.insert(characters)
      .values({ ownerId: owner, name: '내 캐릭터', personality: 'p' }).returning()
    expect(await ownedQuery(c!.id, owner)).toHaveLength(1)
  })

  it('another user cannot reach it', async () => {
    const owner = await user()
    const stranger = await user()
    const [c] = await db.insert(characters)
      .values({ ownerId: owner, name: '내 캐릭터', personality: 'p' }).returning()
    expect(await ownedQuery(c!.id, stranger)).toHaveLength(0)
  })

  it('official characters are not editable by anyone', async () => {
    const anyUser = await user()
    const [official] = await db.select({ id: characters.id })
      .from(characters).where(eq(characters.slug, 'thomas')).limit(1)
    expect(await ownedQuery(official!.id, anyUser)).toHaveLength(0)
  })

  it('a soft-deleted character is no longer editable', async () => {
    const owner = await user()
    const [c] = await db.insert(characters)
      .values({ ownerId: owner, name: '삭제될 캐릭터', personality: 'p' }).returning()
    await db.update(characters).set({ deletedAt: new Date() }).where(eq(characters.id, c!.id))
    expect(await ownedQuery(c!.id, owner)).toHaveLength(0)
  })
})
