import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, pushSubscriptions, subscriptions, users, userSettings } from '@miro/db'
import { notifyExpiringPasses } from '../expiry-notice'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const day = 86_400_000

describeDb('pass expiry notice', () => {
  const made: string[] = []
  async function user() {
    const [u] = await db.insert(users).values({ email: `exp-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    made.push(u!.id)
    // 보낼 기기가 있어야 실제 발송 경로를 지난다.
    await db.insert(pushSubscriptions).values({ userId: u!.id, endpoint: `https://push.test/${u!.id}`, p256dh: 'k', auth: 'a' })
    return u!.id
  }
  async function pass(userId: string, endsIn: number, now: Date) {
    await db.insert(subscriptions).values({
      userId, plan: 'pro', status: 'active', renewalStatus: 'cancelled',
      currentPeriodStart: new Date(now.getTime() - 27 * day), currentPeriodEnd: new Date(now.getTime() + endsIn),
      externalRef: `ref_${userId}`, provider: 'mock',
    })
  }
  const noticeOf = async (userId: string) =>
    (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)))[0]!.expiryNotice
  /** 다른 테스트의 행도 같은 배치에 섞이므로 합계가 아니라 이 사용자의 단계를 본다. */
  const run = async (userId: string, now: Date) => { await notifyExpiringPasses(now); return noticeOf(userId) }

  afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })

  // 밤을 피한 시각을 쓴다 (KST 정오). 밤(23~8시)에는 발송을 미루는 게 정상 동작이라 테스트가 흔들린다.
  const noon = new Date('2026-09-16T03:00:00Z')

  it('notifies three days out, and not twice for the same stage', async () => {
    const u = await user(); await pass(u, 2 * day, noon)
    expect(await run(u, noon)).toBe('soon')
    // 15분마다 도는 cron 이 같은 안내를 다시 보내지 않는다 — 이 사용자는 배치에서 빠진다.
    const again = await notifyExpiringPasses(new Date(noon.getTime() + 900_000))
    expect(again.soon + again.ended).toBe(0)
  })

  it('a pass further out than the window is left alone', async () => {
    const u = await user(); await pass(u, 10 * day, noon)
    expect(await run(u, noon)).toBe(null)
  })

  it('sends the ended notice after the soon notice, once each', async () => {
    const u = await user(); await pass(u, 2 * day, noon)
    expect(await run(u, noon)).toBe('soon')
    const after = new Date(noon.getTime() + 3 * day)
    expect(await run(u, after)).toBe('ended')
    // 마지막 단계까지 간 행은 다시 걸리지 않는다.
    const again = await notifyExpiringPasses(new Date(after.getTime() + 900_000))
    expect(await noticeOf(u)).toBe('ended')
    expect(again.ended).toBe(0)
  })

  it('a pass that already ended gets only the ended notice, never a late warning', async () => {
    const u = await user(); await pass(u, -1 * day, noon)
    expect(await run(u, noon)).toBe('ended')
  })

  // 알림 수신은 끌 수 없다 (2026-09-24) — 예전에 꺼 둔 값은 읽지 않는다. 밤에는 단계도 남기지 않고 낮에 보낸다.
  it('waits out the night, whatever the stored push setting', async () => {
    const u = await user(); await pass(u, 2 * day, noon)
    await db.insert(userSettings).values({ userId: u, pushEnabled: false })
    expect(await run(u, new Date('2026-09-15T17:00:00Z'))).toBeNull() // 02:00 KST
    expect(await run(u, noon)).toBe('soon')
  })
})
