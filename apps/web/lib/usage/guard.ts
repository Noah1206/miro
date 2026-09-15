import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { db, subscriptions, usageLedger, usageWindows, users } from '@miro/db'
import { usagePolicy, productionRuntime, type Plan } from '@miro/config'
import { costOf, decide, isEntitled, isWindowActive, openWindow, type UsageKind } from '@miro/domain'
import { track } from '@/lib/analytics/track'
import { observe } from '@/lib/observe'

export class UsageExceededError extends Error {
  constructor(readonly plan: Plan, readonly resetsAt: Date) {
    super('usage limit reached')
    this.name = 'UsageExceededError'
  }
}

export type Reservation = { reservationId: string; cost: number; windowId: string; reused: boolean; continuity: boolean }

/** `db` 또는 열려 있는 트랜잭션(tx) 어느 쪽으로도 읽을 수 있게. */
type Reader = Pick<typeof db, 'select'>

/**
 * 유효 요금제. 구독(active, 또는 해지됐지만 기간이 남은)이 있으면 pro.
 * 없으면 users.plan — P13 전까지는 dev 토글이 이 값을 쓴다.
 *
 * 트랜잭션 안에서 부를 때는 반드시 그 tx 를 넘긴다. 전역 `db` 로 읽으면 커넥션을
 * 하나 더 요구하는데, 바깥 트랜잭션이 이미 advisory lock 을 쥔 채 풀을 점유하고 있어
 * 풀 크기가 작으면(서버리스·pooler 환경의 max:1) 서로를 기다리다 멈춘다.
 */
export async function effectivePlan(userId: string, now = new Date(), reader: Reader = db): Promise<Plan> {
  const [sub] = await reader.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1)
  if (sub && (!productionRuntime() || sub.provider === 'stripe') && isEntitled(sub as never, now)) return 'pro'
  if (productionRuntime()) return 'free'
  const [u] = await reader.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.plan ?? 'free'
}

/**
 * Provider 호출 전 예약. 서버 기준으로만 판정하며 클라이언트 값을 믿지 않는다.
 *
 * 창이 없거나 만료됐으면 해당 KST 달력 월의 창을 연다.
 * 같은 idempotencyKey 는 두 번 차감하지 않는다 (재시도 안전).
 * 한도 초과 시 UsageExceededError — 어떤 상태도 삭제하지 않는다.
 *
 * 사용자 단위 advisory lock 으로 동시 첫 요청의 창 중복 생성을 막는다.
 */
export async function reserve(opts: {
  userId: string; kind: UsageKind; units?: number; idempotencyKey: string; now?: Date
}): Promise<Reservation> {
  const now = opts.now ?? new Date()
  const units = opts.units ?? 1
  const policy = usagePolicy()
  costOf(opts.kind, units)

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${opts.userId}))`)

    const [existing] = await tx.select().from(usageLedger)
      .where(eq(usageLedger.idempotencyKey, opts.idempotencyKey)).limit(1)
    if (existing && (existing.userId !== opts.userId || existing.kind !== opts.kind || existing.units !== units)) throw new Error('idempotency mismatch')
    if (existing && existing.status !== 'rolled_back') {
      return { reservationId: existing.id, cost: existing.amount, windowId: existing.windowId, reused: true, continuity: existing.continuity }
    }

    let [win] = await tx.select().from(usageWindows)
      .where(and(eq(usageWindows.userId, opts.userId), gt(usageWindows.endsAt, now), eq(usageWindows.period, 'monthly')))
      .orderBy(desc(usageWindows.startedAt)).limit(1)

    if (!win || !isWindowActive(win, now)) {
      const plan = await effectivePlan(opts.userId, now, tx)
      ;[win] = await tx.insert(usageWindows).values({ ...openWindow(opts.userId, plan, now), policyVersion: policy.version }).returning()
    }

    const plan = await effectivePlan(opts.userId, now, tx)
    const limit = policy.monthly[plan]
    await tx.update(usageWindows).set({ plan, limit, policyVersion: policy.version }).where(eq(usageWindows.id, win!.id))
    win = { ...win!, plan, limit }
    const decision = decide(win, opts.kind, units, now)
    const cost = costOf(opts.kind, units)
    const continuity = !decision.allowed && ['textRP', 'complexEvent', 'majorEvent'].includes(opts.kind) && policy.continuity.enabled && win.continuityConsumed + cost <= policy.continuity.reserve
    if (!decision.allowed && !continuity) {
      observe('usage.limit_reached', { userId: opts.userId, kind: opts.kind, plan: decision.plan })
      void track(opts.userId, 'usage_limit_reached', { kind: opts.kind, plan: decision.plan })
      throw new UsageExceededError(decision.plan, decision.resetsAt)
    }

    const values = { windowId: win.id, userId: opts.userId, kind: opts.kind, units, amount: cost,
      idempotencyKey: opts.idempotencyKey, continuity, status: 'reserved' as const }
    const [ledger] = existing
      ? await tx.update(usageLedger).set(values).where(eq(usageLedger.id, existing.id)).returning({ id: usageLedger.id })
      : await tx.insert(usageLedger).values(values).returning({ id: usageLedger.id })
    await tx.update(usageWindows).set(continuity
      ? { continuityConsumed: sql`${usageWindows.continuityConsumed} + ${cost}` }
      : { consumed: sql`${usageWindows.consumed} + ${cost}` }).where(eq(usageWindows.id, win.id))
    return { reservationId: ledger!.id, cost, windowId: win.id, reused: false, continuity }

  })
}

/** Provider 성공 후 확정. 통화처럼 실제 사용량이 나중에 정해지면 actualUnits 로 보정한다. */
export async function commit(reservationId: string, actualUnits?: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [l] = await tx.select().from(usageLedger).where(eq(usageLedger.id, reservationId)).limit(1).for('update')
    if (!l || l.status !== 'reserved') return
    let amount = l.amount
    if (actualUnits !== undefined && actualUnits !== l.units) {
      if (!Number.isSafeInteger(actualUnits) || actualUnits < 0) throw new Error('invalid actual usage')
      amount = l.units > 0 ? Math.ceil(l.amount / l.units * actualUnits) : 0
      await tx.update(usageWindows)
        .set(l.continuity ? { continuityConsumed: sql`${usageWindows.continuityConsumed} + ${amount - l.amount}` } : { consumed: sql`${usageWindows.consumed} + ${amount - l.amount}` })
        .where(eq(usageWindows.id, l.windowId))
    }
    await tx.update(usageLedger).set({ status: 'committed', units: actualUnits ?? l.units, amount })
      .where(eq(usageLedger.id, reservationId))
  })
}

/** Provider 실패 시 되돌린다. 실패한 생성에 사용량을 물리지 않는다. */
export type UsageTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Reuse the caller transaction so request failure and refund commit together. */
export async function rollbackInTransaction(tx: UsageTransaction, reservationId: string): Promise<void> {
    const [l] = await tx.select().from(usageLedger).where(eq(usageLedger.id, reservationId)).limit(1).for('update')
    if (!l || l.status !== 'reserved') return
    await tx.update(usageLedger).set({ status: 'rolled_back' }).where(eq(usageLedger.id, reservationId))
    await tx.update(usageWindows)
      .set(l.continuity ? { continuityConsumed: sql`greatest(0, ${usageWindows.continuityConsumed} - ${l.amount})` } : { consumed: sql`greatest(0, ${usageWindows.consumed} - ${l.amount})` })
      .where(eq(usageWindows.id, l.windowId))
}

export async function rollback(reservationId: string): Promise<void> {
  await db.transaction(tx => rollbackInTransaction(tx, reservationId))
}

/** Provider 호출을 예약/확정/롤백으로 감싼다. 호출부 6곳이 이 한 함수를 쓴다. */
export async function guarded<T>(
  opts: { userId: string; kind: UsageKind; units?: number; idempotencyKey: string },
  work: () => Promise<T>,
): Promise<T> {
  const r = await reserve(opts)
  if (r.reused) throw new Error('request already processed')
  try {
    const out = await work()
    await commit(r.reservationId)
    return out
  } catch (e) {
    if (!r.reused) { await rollback(r.reservationId); observe('usage.rolled_back', { userId: opts.userId, kind: opts.kind }) }
    throw e
  }
}

export type UsageStatus = {
  plan: Plan
  limit: number
  consumed: number
  remaining: number
  /** 활성 창이 없으면 null — 다음 요청이 새 창을 연다. */
  resetsAt: Date | null
  period: 'monthly'
  usedPercent: number
  continuityRemaining: number
}

export async function usageStatus(userId: string, now = new Date()): Promise<UsageStatus> {
  const plan = await effectivePlan(userId, now)
  const [win] = await db.select().from(usageWindows)
    .where(and(eq(usageWindows.userId, userId), gt(usageWindows.endsAt, now), eq(usageWindows.period, 'monthly')))
    .orderBy(desc(usageWindows.startedAt)).limit(1)
  const policy = usagePolicy()
  const limit = policy.monthly[plan]
  if (!win) return { plan, limit, consumed: 0, remaining: limit, resetsAt: openWindow(userId, plan, now).endsAt, period: 'monthly', usedPercent: 0, continuityRemaining: policy.continuity.enabled ? policy.continuity.reserve : 0 }
  return {
    plan, limit, consumed: win.consumed,
    remaining: Math.max(0, limit - win.consumed), resetsAt: win.endsAt,
    period: 'monthly', usedPercent: Math.min(100, Math.round(win.consumed / limit * 100)),
    continuityRemaining: policy.continuity.enabled ? Math.max(0, policy.continuity.reserve - win.continuityConsumed) : 0,
  }
}

/**
 * 서버 액션이 사용자에게 돌려줄 한도 안내.
 * 사용량이 0 이어도 MIRO 기본 대화는 계속 가능하므로 그 길을 함께 알린다 — 모델을 몰래 바꾸지는 않는다.
 */
export function exceededMessage(e: UsageExceededError): string {
  const t = e.resetsAt.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })
  const miro = ' MIRO 기본 대화는 계속 이어갈 수 있어요.'
  if (productionRuntime()) return `이번 달 Reality 사용량을 모두 썼어요. ${t}에 초기화됩니다. 기존 대화와 기억은 유지돼요.${miro}`
  return e.plan === 'free'
    ? `이번 사용량을 모두 썼어요. ${t}에 초기화되거나, Pro로 더 넉넉하게 이어갈 수 있어요.${miro}`
    : `이번 사용량을 모두 썼어요. ${t}에 초기화됩니다.${miro}`
}
