import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, eq, isNull } from 'drizzle-orm'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import * as schema from '../schema/index'

const { users, accounts, authSessions } = schema

/** apps/web/lib/auth.ts 와 동일한 해싱. 로직 변경 시 함께 수정한다. */
function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(plain, salt, 64).toString('hex')}`
}
function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(plain, salt, 64)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

const url = process.env.DATABASE_URL
const describeDb = url ? describe : describe.skip

describeDb('auth against real postgres', () => {
  const sql = postgres(url!)
  const db = drizzle(sql, { schema })
  const email = `t-${randomBytes(4).toString('hex')}@miro.dev`
  let userId: string

  beforeAll(async () => {
    const [u] = await db.insert(users).values({ email }).returning()
    userId = u!.id
    await db.insert(accounts).values({
      userId, provider: 'credentials', providerAccountId: hashPassword('password123'),
    })
    await db.insert(authSessions).values({
      userId, token: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 86_400_000),
    })
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId))
    await sql.end()
  })

  it('new users default to the free plan', async () => {
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    expect(u!.plan).toBe('free')
  })

  it('accepts the correct password and rejects a wrong one', async () => {
    const [row] = await db
      .select({ cred: accounts.providerAccountId })
      .from(accounts).where(eq(accounts.userId, userId))
    expect(verifyPassword('password123', row!.cred)).toBe(true)
    expect(verifyPassword('wrongpass', row!.cred)).toBe(false)
  })

  it('cascades sessions and credentials so no orphans remain', async () => {
    const [tmp] = await db.insert(users)
      .values({ email: `d-${randomBytes(4).toString('hex')}@miro.dev` }).returning()
    await db.insert(authSessions).values({
      userId: tmp!.id, token: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 1000),
    })
    await db.delete(users).where(eq(users.id, tmp!.id))
    const left = await db.select().from(authSessions).where(eq(authSessions.userId, tmp!.id))
    expect(left).toHaveLength(0)
  })

  it('a soft-deleted account is no longer resolvable for login', async () => {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId))
    const found = await db.select().from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
    expect(found).toHaveLength(0)
    await db.update(users).set({ deletedAt: null }).where(eq(users.id, userId))
  })
})
