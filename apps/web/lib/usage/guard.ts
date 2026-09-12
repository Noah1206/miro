import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { db, subscriptions, usageLedger, usageWindows, users } from '@miro/db'
import { POLICY, type Plan } from '@miro/config'
import { costOf, decide, isWindowActive, openWindow, type UsageKind } from '@miro/domain'

export class UsageExceededError extends Error {
  constructor(readonly plan: Plan, readonly resetsAt: Date) {
    super('usage limit reached')
    this.name = 'UsageExceededError'
  }
}

export type Reservation = { reservationId: string; cost: number; windowId: string; reused: boolean }

/**
 * 유효 요금제. 구독(active, 또는 해지됐지만 기간이 남은)이 있으면 pro.
 * 없으면 users.plan — P13 전까지는 dev 토글이 이 값을 쓴다.
 */
export async function effectivePlan(userId: string, now = new Date()): Promise<Plan> {
  const [sub] = await db.select({ status: subscriptions.status, end: subscriptions.currentPeriodEnd })
    .from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1)
  if (sub && sub.status !== 'expired' && sub.end > now) return 'pro'
  const [u] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.plan ?? 'free'
}

/**
 * Provider 호출 전 예약. 서버 기준으로만 판정하며 클라이언트 값을 믿지 않는다.
 *
 * 창이 없거나 만료됐으면 지금을 시작점으로 새 창을 연다.
 * 같은 idempotencyKey 는 두 번 차감하지 않는다 (재시도 안전).
 * 한도 초과 시 UsageExceededError — 어떤 상태도 삭제하지 않는다.
 *
 * ponytail: 사용자 단위 advisory lock 으로 동시 첫 요청의 창 중복 생성을 막는다.
 */
export async function reserve(opts: {
  userId: string; kind: UsageKind; units?: number; idempotencyKey: string; now?: Date
}): Promise<Reservation> {
  const now = opts.now ?? new Date()
  const units = opts.units ?? 1

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${opts.userId}))`)

    const [existing] = await tx.select().from(usageLedger)
      .where(eq(usageLedger.idempotencyKey, opts.idempotencyKey)).limit(1)
    if (existing && existing.status !== 'rolled_back') {
      return { reservationId: existing.id, cost: existing.amount, windowId: existing.windowId, reused: true }
    }

    let [win] = await tx.select().from(usageWindows)
      .where(and(eq(usageWindows.userId, opts.userId), gt(usageWindows.endsAt, now)))
      .orderBy(desc(usageWindows.startedAt)).limit(1)

    if (!win || !isWindowActive(win, now)) {
      const plan = await effectivePlan(opts.userId, now)
      ;[win] = await tx.insert(usageWindows).values(openWindow(opts.userId, plan, now)).returning()
    }

    const decision = decide(win!, opts.kind, units, now)
    if (!decision.allowed) throw new UsageExceededError(decision.plan, decision.resetsAt)

    const [ledger] = await tx.insert(usageLedger).values({
      windowId: win!.id, userId: opts.userId, kind: opts.kind, units,
      amount: decision.cost, idempotencyKey: opts.idempotencyKey,
    }).returning({ id: usageLedger.id })
    await tx.update(usageWindows)
      .set({ consumed: sql`${usageWindows.consumed} + ${decision.cost}` })
      .where(eq(usageWindows.id, win!.id))

    return { reservationId: ledger!.id, cost: decision.cost, windowId: win!.id, reused: false }
  })
}

/** Provider 성공 후 확정. 통화처럼 실제 사용량이 나중에 정해지면 actualUnits 로 보정한다. */
export async function commit(reservationId: string, actualUnits?: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [l] = await tx.select().from(usageLedger).where(eq(usageLedger.id, reservationId)).limit(1)
    if (!l || l.status === 'committed') return
    let amount = l.amount
    if (actualUnits !== undefined && actualUnits !== l.units) {
      amount = costOf(l.kind as UsageKind, actualUnits)
      await tx.update(usageWindows)
        .set({ consumed: sql`${usageWindows.consumed} + ${amount - l.amount}` })
        .where(eq(usageWindows.id, l.windowId))
    }
    await tx.update(usageLedger).set({ status: 'committed', units: actualUnits ?? l.units, amount })
      .where(eq(usageLedger.id, reservationId))
  })
}

/** Provider 실패 시 되돌린다. 실패한 생성에 사용량을 물리지 않는다. */
export async function rollback(reservationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [l] = await tx.select().from(usageLedger).where(eq(usageLedger.id, reservationId)).limit(1)
    if (!l || l.status === 'rolled_back') return
    await tx.update(usageLedger).set({ status: 'rolled_back' }).where(eq(usageLedger.id, reservationId))
    await tx.update(usageWindows)
      .set({ consumed: sql`greatest(0, ${usageWindows.consumed} - ${l.amount})` })
      .where(eq(usageWindows.id, l.windowId))
  })
}

/** Provider 호출을 예약/확정/롤백으로 감싼다. 호출부 6곳이 이 한 함수를 쓴다. */
export async function guarded<T>(
  opts: { userId: string; kind: UsageKind; units?: number; idempotencyKey: string },
  work: () => Promise<T>,
): Promise<T> {
  const r = await reserve(opts)
  try {
    const out = await work()
    await commit(r.reservationId)
    return out
  } catch (e) {
    if (!r.reused) await rollback(r.reservationId)
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
  windowHours: number
}

export async function usageStatus(userId: string, now = new Date()): Promise<UsageStatus> {
  const plan = await effectivePlan(userId, now)
  const [win] = await db.select().from(usageWindows)
    .where(and(eq(usageWindows.userId, userId), gt(usageWindows.endsAt, now)))
    .orderBy(desc(usageWindows.startedAt)).limit(1)
  const limit = POLICY.usage.limits[plan]
  if (!win) return { plan, limit, consumed: 0, remaining: limit, resetsAt: null, windowHours: POLICY.usage.windowHours }
  return {
    plan, limit: win.limit, consumed: win.consumed,
    remaining: Math.max(0, win.limit - win.consumed), resetsAt: win.endsAt,
    windowHours: POLICY.usage.windowHours,
  }
}

/** 서버 액션이 사용자에게 돌려줄 한도 안내. Free 는 Pro 안내, Pro 는 초기화 대기. */
export function exceededMessage(e: UsageExceededError): string {
  const t = e.resetsAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  return e.plan === 'free'
    ? `이번 사용량을 모두 썼어요. ${t}에 초기화되거나, Pro로 더 넉넉하게 이어갈 수 있어요.`
    : `이번 사용량을 모두 썼어요. ${t}에 초기화됩니다.`
}
