import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, bankTransferOrders, subscriptions, users } from '@miro/db'
import {
  bankOrderHistory, createBankOrder, expireBankOrders, pendingBankOrder,
  settleApprovedOrders, BankTransferUnavailableError, OrderPendingError,
} from '../bank-transfer'

/**
 * 승인은 운영 콘솔이 한다. 사용자 앱은 그쪽을 import 하지 않으므로 — 그 경계를 지키는
 * 테스트가 따로 있다 — 여기서는 승인된 상태를 직접 만들어 지급 경로만 검증한다.
 * 승인 자체의 규칙(권한·중복·감사)은 운영 콘솔 스위트에 있다.
 *
 * 승인자를 비워 두지 않는 이유: DB CHECK 가 승인된 주문에 결정자를 요구한다. 그 불변식을
 * 테스트가 우회하면 제약이 지키는 것을 검증하지 못한다.
 */
async function markApproved(orderId: string, note = '') {
  const [decider] = await db.execute<{ id: string }>(
    sql`INSERT INTO admin_users (email, password_hash, role) VALUES (${`d-${randomBytes(5).toString('hex')}@miro.dev`}, 'x', 'superadmin') RETURNING id`)
  deciders.push(decider!.id)
  await db.update(bankTransferOrders)
    .set({ status: 'approved', decidedBy: decider!.id, decidedAt: new Date(), note })
    .where(and(eq(bankTransferOrders.id, orderId), eq(bankTransferOrders.status, 'awaiting')))
}
const deciders: string[] = []
import { effectivePlan, rechargeBalance } from '@/lib/usage/guard'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const ACCOUNT = JSON.stringify({ bank: '테스트은행', number: '123-456-7890', holder: '미로' })
const PRODUCT = JSON.stringify([{ id: 'pack_m', name: '충전 7,000원', units: 800, priceMinor: 7000, currency: 'KRW' }])

describeDb('bank transfer orders', () => {
  const made: string[] = []
  async function user() {
    const [u] = await db.insert(users).values({ email: `bt-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    made.push(u!.id); return u!.id
  }

  beforeEach(() => { vi.stubEnv('MIRO_BANK_ACCOUNT', ACCOUNT); vi.stubEnv('MIRO_RECHARGE_PRODUCTS', PRODUCT) })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    for (const id of made) await db.delete(users).where(eq(users.id, id))
    for (const id of deciders) await db.execute(sql`DELETE FROM admin_users WHERE id = ${id}`)
  })

  it('does not take an order when no account is configured', async () => {
    const u = await user(); vi.stubEnv('MIRO_BANK_ACCOUNT', '')
    await expect(createBankOrder({ userId: u, kind: 'pass', depositorName: '홍길동' }))
      .rejects.toBeInstanceOf(BankTransferUnavailableError)
  })

  it('creating an order grants nothing until an admin approves it', async () => {
    const u = await user()
    const order = await createBankOrder({ userId: u, kind: 'pass', depositorName: '홍길동' })
    expect(order.amountMinor).toBe(9900)
    expect(order.referenceCode).toMatch(/^[A-Z2-9]{6}$/)
    // 주문만으로는 아무것도 주지 않는다.
    expect(await effectivePlan(u)).toBe('free')
    expect((await pendingBankOrder(u))!.status).toBe('awaiting')

    await markApproved(order.id)
    // 승인만으로는 아직 지급되지 않는다 — cron 이 지급한다.
    expect(await effectivePlan(u)).toBe('free')
    expect(await settleApprovedOrders()).toEqual({ settled: 1, failed: 0 })
    expect(await effectivePlan(u)).toBe('pro')
  })

  it('approving twice pays out once', async () => {
    const u = await user()
    const order = await createBankOrder({ userId: u, kind: 'recharge', productId: 'pack_m', depositorName: '홍길동' })
    await markApproved(order.id)
    await settleApprovedOrders()
    expect(await rechargeBalance(u)).toBe(800)
    // 지급이 끝난 주문은 다시 지급되지 않는다 — settledAt 이 있고, 그래도 들어오면 UNIQUE 가 막는다.
    expect(await settleApprovedOrders()).toEqual({ settled: 0, failed: 0 })
    expect(await rechargeBalance(u)).toBe(800)
  })

  it('two settlement runs at the same moment pay out once', async () => {
    const u = await user()
    const order = await createBankOrder({ userId: u, kind: 'recharge', productId: 'pack_m', depositorName: '홍길동' })
    await markApproved(order.id)
    // cron 이 겹쳐 돌아도 지급은 한 번이다 — payment_events 의 UNIQUE 가 막는다.
    await Promise.all([settleApprovedOrders(), settleApprovedOrders()])
    expect(await rechargeBalance(u)).toBe(800)
  })

  it('a second pass extends the same subscription instead of colliding on its ref', async () => {
    // pass 의 externalRef 는 사용자당 고정이다 (구독 행이 하나뿐이라서). 두 번째 구매가
    // UNIQUE 에 걸려 조용히 실패하지 않는지 — 중복 판정은 orderId 기반 eventId 가 맡는다.
    const u = await user()
    const first = await createBankOrder({ userId: u, kind: 'pass', depositorName: '홍길동' })
    await markApproved(first.id); await settleApprovedOrders()
    const [before] = await db.select().from(subscriptions).where(eq(subscriptions.userId, u))

    const second = await createBankOrder({ userId: u, kind: 'pass', depositorName: '홍길동' })
    await markApproved(second.id)
    expect(await settleApprovedOrders()).toEqual({ settled: 1, failed: 0 })
    const [after] = await db.select().from(subscriptions).where(eq(subscriptions.userId, u))
    expect(after!.currentPeriodEnd.getTime()).toBeGreaterThan(before!.currentPeriodEnd.getTime())
  })

  it('the amount comes from the server catalogue, not the caller', async () => {
    const u = await user()
    const order = await createBankOrder({ userId: u, kind: 'recharge', productId: 'pack_m', depositorName: '홍길동' })
    expect(order.amountMinor).toBe(7000)
    const [row] = await db.select().from(bankTransferOrders).where(eq(bankTransferOrders.id, order.id))
    expect(row!.units).toBe(800)
    // 주문 접수 뒤 카탈로그가 바뀌어도 접수 당시 조건으로 지급한다.
    vi.stubEnv('MIRO_RECHARGE_PRODUCTS', JSON.stringify([{ id: 'pack_m', name: 'x', units: 99999, priceMinor: 100, currency: 'KRW' }]))
    await markApproved(order.id)
    await settleApprovedOrders()
    expect(await rechargeBalance(u)).toBe(800)
  })

  it('refuses an unknown product and an empty depositor name', async () => {
    const u = await user()
    await expect(createBankOrder({ userId: u, kind: 'recharge', productId: 'nope', depositorName: '홍길동' })).rejects.toThrow()
    await expect(createBankOrder({ userId: u, kind: 'pass', depositorName: 'x'.repeat(41) })).rejects.toThrow('INVALID_DEPOSITOR_NAME')
  })

  it('allows only one waiting order per user, and frees it once expired', async () => {
    const u = await user()
    const first = await createBankOrder({ userId: u, kind: 'pass', depositorName: '홍길동' })
    await expect(createBankOrder({ userId: u, kind: 'pass', depositorName: '홍길동' }))
      .rejects.toBeInstanceOf(OrderPendingError)
    // 기한이 지나면 만료되고 다시 주문할 수 있다.
    // 반드시 이 사용자로 범위를 좁힌다 — 인자 없이 부르면 DB 안의 모든 대기 주문이
    // 만료돼 같은 테스트 DB 를 쓰는 다른 스위트(E2E 포함)의 주문까지 쓸어버린다.
    const later = new Date(first.expiresAt.getTime() + 1000)
    expect(await expireBankOrders(later, u)).toBe(1)
    await expect(createBankOrder({ userId: u, kind: 'pass', depositorName: '홍길동', now: later })).resolves.toBeTruthy()
  })

  it('an expired order is never settled', async () => {
    const u = await user()
    const order = await createBankOrder({ userId: u, kind: 'pass', depositorName: '홍길동' })
    await expireBankOrders(new Date(order.expiresAt.getTime() + 1000), u)
    await markApproved(order.id)   // 만료된 주문은 승인 상태로 넘어가지 않는다
    await settleApprovedOrders()
    expect(await effectivePlan(u)).toBe('free')
  })

  it('records the settlement and attributes the payment to the bank provider', async () => {
    const u = await user()
    const order = await createBankOrder({ userId: u, kind: 'pass', depositorName: '홍길동' })
    await markApproved(order.id, '9/16 입금 확인')
    await settleApprovedOrders()
    const [row] = await db.select().from(bankTransferOrders).where(eq(bankTransferOrders.id, order.id))
    expect(row!.settledAt).toBeInstanceOf(Date); expect(row!.note).toBe('9/16 입금 확인')
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, u))
    expect(sub!.provider).toBe('bank_transfer')
    // 사용자 화면이 보여 주는 주문 내역.
    expect((await bankOrderHistory(u))[0]!.status).toBe('approved')
  })
})
