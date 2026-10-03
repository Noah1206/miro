import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, accounts, users } from '@miro/db'
import { purgeExpiredPersonalData } from '../account'
import { testDatabaseUrl } from '../../../../../tooling/test-database'

const describeDb = testDatabaseUrl(process.env.DATABASE_URL) ? describe : describe.skip
const made: string[] = []
afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })

/** 10/3 점검: 처리방침 3항 — 삭제한 계정의 이메일·소셜 식별값은 1년 뒤에 지운다. 1년이 안 됐으면 남긴다. */
describeDb('보관 기간이 지난 개인정보 파기', () => {
  it('scrubs email and social IDs only after a year from deletion', async () => {
    const now = new Date('2027-10-03T00:00:00Z')
    const mk = async (deletedAt: Date) => {
      const [u] = await db.insert(users).values({ email: `purge-${randomUUID()}@example.test`, deletedAt }).returning({ id: users.id })
      made.push(u!.id)
      await db.insert(accounts).values({ userId: u!.id, provider: 'google', providerAccountId: randomUUID() })
      return u!.id
    }
    const old = await mk(new Date('2026-09-01T00:00:00Z')), recent = await mk(new Date('2027-09-01T00:00:00Z'))
    await purgeExpiredPersonalData(now)
    const email = async (id: string) => (await db.select({ e: users.email }).from(users).where(eq(users.id, id)))[0]!.e
    const links = async (id: string) => (await db.select().from(accounts).where(eq(accounts.userId, id))).length
    expect(await email(old)).toBeNull()
    expect(await links(old)).toBe(0)
    expect(await email(recent)).not.toBeNull()
    expect(await links(recent)).toBe(1)
  })
})
