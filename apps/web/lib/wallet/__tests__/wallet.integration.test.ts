import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { adminUsers, bankTransferOrders, db, rechargeGrants, users } from '@miro/db'
import { createBankOrder, OrderPendingError, settleApprovedOrders } from '@/lib/payments/bank-transfer'
import { walletHistory, walletSnapshot } from '../service'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const made: string[] = []
const admins: string[] = []
async function user() {
  const [u] = await db.insert(users).values({ email: `wallet-${randomUUID()}@miro.dev` }).returning()
  made.push(u!.id); return u!.id
}
async function approve(id: string) {
  const [a] = await db.insert(adminUsers).values({ email: `wallet-${randomUUID()}@miro.dev`, passwordHash: 'test', role: 'superadmin' }).returning()
  admins.push(a!.id)
  await db.update(bankTransferOrders).set({ status: 'approved', decidedBy: a!.id, decidedAt: new Date() }).where(eq(bankTransferOrders.id, id))
}
describeDb('Miro Pay uses authoritative wallet and payment records', () => {
  beforeEach(() => {
    vi.stubEnv('MIRO_BANK_ACCOUNT', JSON.stringify({ bank: '테스트', number: '000-000-0000', holder: '테스트' }))
    vi.stubEnv('MIRO_RECHARGE_PRODUCTS', JSON.stringify([{ id: 'small', name: '기본 충전', units: 300, priceMinor: 3000, currency: 'KRW' }]))
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    for (const id of made) await db.delete(users).where(eq(users.id, id))
    for (const id of admins) await db.delete(adminUsers).where(eq(adminUsers.id, id))
  })

  it('reuses concurrent purchase requests, including a retry after settlement or catalog removal', async () => {
    const userId = await user(), requestId = randomUUID()
    const input = { userId, requestId, kind: 'recharge' as const, productId: 'small' }
    const orders = await Promise.all(Array.from({ length: 5 }, () => createBankOrder(input)))
    expect(new Set(orders.map(o => o.id)).size).toBe(1)
    expect(orders[0]!.amountMinor).toBe(3000)
    const placed = await walletSnapshot(userId)
    expect(placed.rechargeRemaining).toBe(0)
    // 내역의 주문 줄은 원화를 '3,000원' 으로 적는다 — 운영 지갑에 '9900 KRW' 가 날것으로 보였다(9/28).
    expect(placed.history.entries.find(e => e.id.startsWith('order:'))).toMatchObject({ detail: '3,000원', status: '입금 대기' })
    await approve(requestId)
    const awaiting = await walletSnapshot(userId)
    expect(awaiting.order).toMatchObject({ status: 'approved', settledAt: null })
    expect(awaiting.rechargeRemaining).toBe(0)
    await expect(createBankOrder({ ...input, requestId: randomUUID() })).rejects.toBeInstanceOf(OrderPendingError)
    await settleApprovedOrders()
    vi.stubEnv('MIRO_RECHARGE_PRODUCTS', '')
    expect((await createBankOrder(input)).id).toBe(requestId)
    const settled = await walletSnapshot(userId, requestId)
    expect(settled.rechargeRemaining).toBe(300)
    expect(settled.order?.settledAt).not.toBeNull()
    expect(await db.select().from(bankTransferOrders).where(eq(bankTransferOrders.userId, userId))).toHaveLength(1)
    expect(settled.history.entries.filter(e => e.id.startsWith('grant:'))).toHaveLength(1)
    expect(settled.history.entries.filter(e => e.id.startsWith('order:'))).toHaveLength(0)
  })

  it('cannot replay another user purchase or read their order, balance or history', async () => {
    const owner = await user(), stranger = await user(), requestId = randomUUID()
    await createBankOrder({ userId: owner, requestId, kind: 'recharge', productId: 'small' })
    await expect(createBankOrder({ userId: stranger, requestId, kind: 'recharge', productId: 'small' })).rejects.toThrow('MISMATCH')
    const other = await walletSnapshot(stranger, requestId)
    expect(other.order).toBeNull(); expect(other.rechargeRemaining).toBe(0); expect(other.history.entries).toEqual([])
  })

  it('paginates equal timestamps without dropping or repeating entries', async () => {
    const userId = await user()
    await db.insert(rechargeGrants).values(Array.from({ length: 13 }, () => ({ userId, amount: 10, source: 'grant' as const, createdAt: new Date('2026-09-27T01:02:03.123Z') })))
    let cursor: string | null = null
    const ids: string[] = []
    do {
      const page = await walletHistory(userId, cursor ?? undefined, 4)
      ids.push(...page.entries.map(e => e.id)); cursor = page.cursor
    } while (cursor)
    expect(ids).toHaveLength(13); expect(new Set(ids).size).toBe(13)
    await expect(walletHistory(userId, 'broken')).rejects.toThrow('INVALID_CURSOR')
  })

  it('excludes expired/revoked funds and does not sell a foreign currency as KRW', async () => {
    const userId = await user()
    await db.insert(rechargeGrants).values([
      { userId, source: 'grant', amount: 50, consumed: 10, refunded: 5 },
      { userId, source: 'grant', amount: 100, expiresAt: new Date(0) },
      { userId, source: 'grant', amount: 100, status: 'revoked', refunded: 100 },
    ])
    vi.stubEnv('MIRO_RECHARGE_PRODUCTS', JSON.stringify([{ id: 'usd', name: 'USD', units: 300, priceMinor: 300, currency: 'USD' }]))
    const wallet = await walletSnapshot(userId)
    expect(wallet.rechargeRemaining).toBe(35)
    expect(wallet.available).toBe(wallet.monthlyRemaining + 35)
    expect(wallet.products).toEqual([])
    await expect(createBankOrder({ userId, kind: 'recharge', productId: 'usd' })).rejects.toThrow('CURRENCY_UNSUPPORTED')
    expect(await db.select().from(bankTransferOrders).where(and(eq(bankTransferOrders.userId, userId), eq(bankTransferOrders.status, 'awaiting')))).toHaveLength(0)
  })
})
