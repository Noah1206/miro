import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db, aiBudgetCounters, aiUsage, bankTransferOrders, opsAlerts, users } from '@miro/db'
import { startOfDayKST } from '@/lib/usage/ai-usage'
import { collectOpsAlerts, notifyOperators } from '../alerts'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
// 먼 미래 날짜 — 같은 DB 를 쓰는 다른 테스트의 오늘 카운터와 키가 겹치지 않게.
const NOW = new Date('2031-03-01T06:00:00+09:00')
const KEYS = ['connected', 'ai_failures', 'budget_cost', 'budget_requests', 'orders_waiting', 'push_failed']

describeDb('operator alerts', () => {
  afterEach(async () => {
    vi.unstubAllEnvs(); vi.unstubAllGlobals()
    await db.delete(opsAlerts).where(inArray(opsAlerts.key, KEYS))
    await db.delete(aiUsage).where(eq(aiUsage.model, 'ops-alert-test'))
    await db.delete(aiBudgetCounters).where(eq(aiBudgetCounters.key, `${startOfDayKST(NOW).toISOString()}:global`))
  })

  it('reports provider failures, budget exhaustion and stale deposits from the records alone', async () => {
    vi.stubEnv('AI_DAILY_BUDGET', '2')
    const [u] = await db.insert(users).values({ email: `ops-${randomUUID()}@test.local` }).returning({ id: users.id })
    await db.insert(aiUsage).values([1, 2, 3].map(() => ({
      task: 'dialogue', provider: 'gemini', model: 'ops-alert-test', latencyMs: 1, ok: false, error: 'boom', createdAt: new Date(NOW.getTime() - 60_000),
    })))
    await db.insert(aiBudgetCounters).values({ key: `${startOfDayKST(NOW).toISOString()}:global`, requests: 10, cost: '2.5', expiresAt: new Date(NOW.getTime() + 86_400_000) })
    await db.insert(bankTransferOrders).values({
      userId: u!.id, kind: 'recharge', productId: 'x', amountMinor: 3000, currency: 'KRW', units: 300, referenceCode: `OPS${randomUUID().slice(0, 4)}`, depositorName: '테스트',
      status: 'awaiting', createdAt: new Date(NOW.getTime() - 30 * 3600_000), expiresAt: new Date(NOW.getTime() + 40 * 3600_000),
    })
    const keys = (await collectOpsAlerts(NOW)).map((a) => a.key)
    expect(keys).toContain('ai_failures')
    expect(keys).toContain('budget_cost')
    expect(keys).toContain('orders_waiting')
    await db.delete(bankTransferOrders).where(eq(bankTransferOrders.userId, u!.id))
    await db.delete(users).where(eq(users.id, u!.id))
  })

  it('posts to Discord once per alert, greets once on first contact, and stays quiet without a webhook', async () => {
    vi.stubEnv('AI_DAILY_BUDGET', '2')
    await db.insert(aiBudgetCounters).values({ key: `${startOfDayKST(NOW).toISOString()}:global`, requests: 1, cost: '2', expiresAt: new Date(NOW.getTime() + 86_400_000) })
    const posts: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => { posts.push(String(init.body)); return new Response(null, { status: 204 }) }))

    expect(await notifyOperators(NOW)).toEqual({ alerts: 1, sent: 0 })   // 웹훅 없음 — 보내지 않는다
    vi.stubEnv('MIRO_OPS_DISCORD_WEBHOOK', 'https://discord.test/hook')
    expect(await notifyOperators(NOW)).toEqual({ alerts: 1, sent: 2 })   // 연결됨 + 예산 소진
    expect(posts.join('\n')).toContain('운영자 알림 연결됨')
    expect(posts.join('\n')).toContain('일일 예산 소진')
    expect(await notifyOperators(new Date(NOW.getTime() + 3600_000))).toEqual({ alerts: 1, sent: 0 })   // 6시간 안에는 반복하지 않는다
    expect(await notifyOperators(new Date(NOW.getTime() + 7 * 3600_000))).toEqual({ alerts: 1, sent: 1 })   // 6시간 뒤 다시, 인사는 안 한다
  })
})
