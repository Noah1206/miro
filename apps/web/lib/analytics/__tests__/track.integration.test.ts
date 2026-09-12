import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, analyticsEvents, users } from '@miro/db'
import { track } from '../track'
const describeDb = process.env.DATABASE_URL ? describe : describe.skip
describeDb('track', () => {
  const made: string[] = []
  afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })
  it('writes a sanitized row and never throws', async () => {
    const [u] = await db.insert(users).values({ email: `an-${randomBytes(4).toString('hex')}@miro.dev` }).returning(); made.push(u!.id)
    await track(u!.id, 'rp_message_sent', { sessionId: 'abc', trust: 99, content: '본문' })
    const rows = await db.select().from(analyticsEvents).where(eq(analyticsEvents.userId, u!.id))
    expect(rows).toHaveLength(1); expect(rows[0]!.props).toEqual({ sessionId: 'abc' })
    await expect(track('not-a-uuid', 'signup', {})).resolves.toBeUndefined()   // FK 실패 → 삼킨다
    await expect(track(u!.id, 'made_up' as never, {})).resolves.toBeUndefined()
  })
  it('events vanish with the user', async () => {
    const [u] = await db.insert(users).values({ email: `an-${randomBytes(4).toString('hex')}@miro.dev` }).returning()
    await track(u!.id, 'signup', {}); await db.delete(users).where(eq(users.id, u!.id))
    expect(await db.select().from(analyticsEvents).where(eq(analyticsEvents.userId, u!.id))).toHaveLength(0)
  })
})
