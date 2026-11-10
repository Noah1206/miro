import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { adminActions, adminUsers, characters, creatorPayouts, db, openPii, rechargeGrants, users } from '@miro/db'
import { commit, earningsBalance, rechargeBalance, reserve, rollbackInTransaction } from '../guard'
import { accrueCreatorReward, sendCheer } from '../creator-reward'
import { earningsHistory, PayoutError, requestPayout, transferToWallet } from '../creator-payout'
import { walletHistory } from '@/lib/wallet/service'
import { markPayoutPaid, monthlyWithholding, rejectPayout } from '../../../../admin/lib/payouts'

/**
 * 창작 보상 돈 흐름 한 바퀴(11/11) — 유료·무료 대화 보상 → 하루 상한·새 계정 제외 → 응원 → 차감 취소 회수
 * → 수익은 대화에 자동으로 안 쓰임 → 지갑으로 옮기기(단방향·중복 1회) → 출금 신청(시행일 전 거절·잔액 초과 거절) → 관리자 반려(되돌림)·송금 완료 → 달별 원천세 집계.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const made: string[] = []
const admins: string[] = []
const OLD = new Date(Date.now() - 10 * 86_400_000)

async function user(createdAt = OLD) {
  const [u] = await db.insert(users).values({ email: `money-${randomUUID()}@miro.dev`, createdAt }).returning()
  made.push(u!.id); return u!.id
}
async function grant(userId: string, amount: number, source: 'purchase' | 'grant', provider: string, expiresAt: Date | null = null) {
  await db.insert(rechargeGrants).values({ userId, amount, source, provider, externalRef: randomUUID(), expiresAt })
}
/** 한 턴 — 차감 확정 뒤 같은 트랜잭션에서 보상 적립(simulation/commit.ts 와 같은 순서). */
async function turn(payerId: string, characterId: string, tokens: number, paidOnly = false) {
  return db.transaction(async tx => {
    const r = await reserve({ userId: payerId, kind: 'textRP', tokenAmount: tokens, paidOnly, idempotencyKey: `turn:${randomUUID()}` }, tx)
    await commit(r.reservationId, undefined, tx)
    await accrueCreatorReward(tx, { reservationId: r.reservationId, payerId, characterId })
    return r.reservationId
  })
}
const rewardRows = async (owner: string) => db.select().from(rechargeGrants).where(eq(rechargeGrants.userId, owner))
  .then(rows => rows.filter(r => r.provider?.startsWith('creator_')))

describeDb('creator money flow', () => {
  let creator: string, payer: string, character: string
  beforeAll(async () => {
    creator = await user(); payer = await user()
    const [c] = await db.insert(characters).values({ name: '테스트', personality: '테스트', ownerId: creator, isPublic: true, isOfficial: false }).returning()
    character = c!.id
    await grant(payer, 20_000, 'purchase', 'test')
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
  afterAll(async () => {
    await db.delete(creatorPayouts).where(inArray(creatorPayouts.userId, made))
    await db.delete(characters).where(eq(characters.id, character))
    for (const id of made) await db.delete(users).where(eq(users.id, id))
    for (const id of admins) { await db.delete(adminActions).where(eq(adminActions.adminId, id)); await db.delete(adminUsers).where(eq(adminUsers.id, id)) }
  })

  it('splits rewards into earnings (paid part) and wallet (free part), caps a payer per day, skips new accounts', async () => {
    await turn(payer, character, 1000, true)                       // 전부 유료 → 수익 100
    expect(await earningsBalance(creator)).toBe(100)
    expect(await rechargeBalance(creator)).toBe(0)                 // 수익은 일반 지갑 잔액이 아니다

    const free = await user()
    await grant(free, 2000, 'grant', 'welcome', new Date(Date.now() + 86_400_000))
    await turn(free, character, 500)                                 // 월간 제공·가입 선물만 → 보상 50 은 일반 지갑
    expect(await earningsBalance(creator)).toBe(100)
    expect(await rechargeBalance(creator)).toBe(50)

    await turn(payer, character, 5000, true)                        // 500 이어야 하지만 이 사람 하루 상한 300 - 100 = 200
    expect(await earningsBalance(creator)).toBe(300)
    await turn(payer, character, 1000, true)                        // 상한 다 참 → 없음
    expect(await earningsBalance(creator)).toBe(300)

    const fresh = await user(new Date())
    await grant(fresh, 1000, 'purchase', 'test')
    await turn(fresh, character, 1000, true)                        // 가입 3일 미만 → 없음
    expect(await earningsBalance(creator)).toBe(300)
  })

  it('takes back the reward when the turn charge is cancelled', async () => {
    const other = await user()
    await grant(other, 1000, 'purchase', 'test')
    const before = await earningsBalance(creator)
    const id = await turn(other, character, 1000, true)
    expect(await earningsBalance(creator)).toBe(before + 100)
    await db.transaction(tx => rollbackInTransaction(tx, id, { committed: true }))
    expect(await earningsBalance(creator)).toBe(before)
    expect((await rewardRows(creator)).filter(r => r.externalRef?.startsWith(id))[0]?.status).toBe('revoked')
  })

  it('adds 70% of a cheer to earnings and only accepts purchased tokens', async () => {
    const before = await earningsBalance(creator)
    await sendCheer({ userId: payer, characterId: character, amount: 1000, requestId: randomUUID() })
    expect(await earningsBalance(creator)).toBe(before + 700)
    const freeOnly = await user()
    await grant(freeOnly, 5000, 'grant', 'welcome')
    await expect(sendCheer({ userId: freeOnly, characterId: character, amount: 100, requestId: randomUUID() })).rejects.toThrow()
  })

  it("never spends earnings on the creator's own chats", async () => {
    const earned = await earningsBalance(creator)
    await grant(creator, 300, 'purchase', 'test')
    const wallet = await rechargeBalance(creator)
    await db.transaction(async tx => commit((await reserve({ userId: creator, kind: 'textRP', tokenAmount: 200, idempotencyKey: `own:${randomUUID()}` }, tx)).reservationId, undefined, tx))
    expect(await earningsBalance(creator)).toBe(earned)
    expect(await rechargeBalance(creator)).toBeLessThanOrEqual(wallet)
  })

  it('moves earnings to the wallet one way, once per request, never more than the balance', async () => {
    const earned = await earningsBalance(creator), wallet = await rechargeBalance(creator)
    const requestId = randomUUID()
    await Promise.all([transferToWallet({ userId: creator, amount: 200, requestId }), transferToWallet({ userId: creator, amount: 200, requestId })])
    expect(await earningsBalance(creator)).toBe(earned - 200)
    expect(await rechargeBalance(creator)).toBe(wallet + 200)
    await expect(transferToWallet({ userId: creator, amount: earned, requestId: randomUUID() })).rejects.toThrow(PayoutError)
    const history = await walletHistory(creator)
    expect(history.entries.some(e => e.label === '수익에서 옮김' && e.amount === 200)).toBe(true)
    expect(history.entries.some(e => e.label === '받은 응원' || e.label === '출금 신청')).toBe(false)
    expect((await earningsHistory(creator)).some(e => e.label === '지갑으로 옮김' && e.amount === -200)).toBe(true)
  })

  it('opens payouts on 12/11, rejects overdrafts, and the admin can reject (refund) or mark paid', async () => {
    vi.stubEnv('MIRO_PII_KEY', Buffer.alloc(32, 7).toString('base64'))
    await grant(creator, 7000, 'grant', 'creator_cheer')            // 출금 최소(6,000)를 넘기도록 수익을 채운다
    const form = { userId: creator, tokens: 6000, realName: '홍길동', rrn: '900101-1234567', bank: '카카오뱅크', accountNumber: '3333-01-2345678' }
    await expect(requestPayout({ ...form, requestId: randomUUID() })).rejects.toThrow('not_open')

    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-12-12T03:00:00Z'))
    const earned = await earningsBalance(creator)
    await expect(requestPayout({ ...form, tokens: earned + 1, requestId: randomUUID() })).rejects.toThrow('over_withdrawable')
    await expect(requestPayout({ ...form, tokens: 5999, requestId: randomUUID() })).rejects.toThrow('below_minimum')
    await expect(requestPayout({ ...form, rrn: '9013011234567', requestId: randomUUID() })).rejects.toThrow('invalid_rrn')

    await requestPayout({ ...form, requestId: randomUUID() })
    expect(await earningsBalance(creator)).toBe(earned - 6000)
    const [first] = await db.select().from(creatorPayouts).where(eq(creatorPayouts.userId, creator))
    expect(first).toMatchObject({ grossKRW: 30_000, incomeTaxKRW: 0, localTaxKRW: 0, netKRW: 30_000, accountNumber: '3333012345678', status: 'requested' })
    expect(first!.rrnSealed).not.toContain('900101')
    expect(openPii(first!.rrnSealed)).toBe('9001011234567')

    const [admin] = await db.insert(adminUsers).values({ email: `money-${randomUUID()}@miro.dev`, passwordHash: 'test', role: 'superadmin' }).returning()
    admins.push(admin!.id)
    expect(await rejectPayout(admin!.id, first!.id, '계좌 확인 필요')).toBe('rejected')
    expect(await earningsBalance(creator)).toBe(earned)               // 반려하면 수익으로 돌아온다
    expect(await rejectPayout(admin!.id, first!.id, '두 번')).toBe('stale')

    await requestPayout({ ...form, tokens: earned >= 10_000 ? 10_000 : 6000, requestId: randomUUID() })
    const [second] = await db.select().from(creatorPayouts).where(eq(creatorPayouts.status, 'requested'))
    expect(await markPayoutPaid(admin!.id, second!.id, '송금함')).toBe('paid')
    const month = await monthlyWithholding('2026-12')
    const mine = month.people.find(p => p.rrn === '9001011234567')
    expect(mine).toMatchObject({ realName: '홍길동', gross: second!.grossKRW, incomeTax: second!.incomeTaxKRW })
  })
})
