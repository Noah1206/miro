import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db, pushSubscriptions, users } from '@miro/db'
import { sendTestPush } from '../test-push'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip

describeDb('test push', () => {
  it('sends one notification to each live subscription of the user and none to nobody', async () => {
    const [u] = await db.insert(users).values({ email: `push-${randomUUID()}@test.local` }).returning({ id: users.id })
    expect(await sendTestPush(u!.id)).toEqual({ devices: 0, sent: 0, gone: 0 })
    await db.insert(pushSubscriptions).values([
      { userId: u!.id, endpoint: `https://push.test/${randomUUID()}`, p256dh: 'k', auth: 'a' },
      { userId: u!.id, endpoint: `https://push.test/${randomUUID()}`, p256dh: 'k', auth: 'a', failedAt: new Date() },   // 만료된 기기는 건너뛴다
    ])
    expect(await sendTestPush(u!.id)).toEqual({ devices: 1, sent: 1, gone: 0 })
    await db.delete(users).where(eq(users.id, u!.id))
  })
})
