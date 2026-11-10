import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { characters, db, rechargeGrants, usageLedger } from '@miro/db'
import { commit, reserve, type UsageTransaction } from './guard'

/**
 * 창작 보상 1단계(11/11) — 다른 사람이 내 캐릭터와 대화하며 실제로 쓴 토큰의 일부를 만든 사람 지갑에 미로 토큰으로 적립한다(현금 아님).
 * 공식 캐릭터·자기 캐릭터와의 대화는 빼고, 턴 차감이 취소되면(리롤·실패) 같이 회수한다. 지급은 (provider, 예약 id) UNIQUE 로 한 번만.
 * ponytail: 여러 계정으로 자기 작품을 돌리는 어뷰징은 막지 않는다 — 앱 안 토큰이라 피해가 작다. 현금 정산(3단계) 전에는 계정·기기 기준 상한을 둔다.
 */
export const CREATOR_REWARD_RATE = 0.1
export const CREATOR_REWARD_PROVIDER = 'creator_reward'
/** 2단계 응원하기(11/11) — 충전한 토큰으로 만든 사람을 응원하면, 만든 사람이 그 70%를 받는다(베이비챗 첫 등급과 같은 비율). */
export const CHEER_PROVIDER = 'creator_cheer'
export const CHEER_SHARE = 0.7
export const CHEER_AMOUNTS = [100, 300, 500, 1000] as const

/** 턴 차감이 확정된 뒤 같은 트랜잭션에서 부른다. */
export async function accrueCreatorReward(tx: UsageTransaction, opts: { reservationId: string; payerId: string; characterId: string }): Promise<void> {
  const [l] = await tx.select({ amount: usageLedger.amount, status: usageLedger.status }).from(usageLedger).where(eq(usageLedger.id, opts.reservationId)).limit(1)
  if (!l || l.status !== 'committed') return
  const [c] = await tx.select({ ownerId: characters.ownerId, isOfficial: characters.isOfficial }).from(characters).where(eq(characters.id, opts.characterId)).limit(1)
  if (!c?.ownerId || c.isOfficial || c.ownerId === opts.payerId) return
  const amount = Math.floor(l.amount * CREATOR_REWARD_RATE)
  if (amount <= 0) return
  await tx.insert(rechargeGrants).values({ userId: c.ownerId, amount, source: 'grant', provider: CREATOR_REWARD_PROVIDER, externalRef: opts.reservationId })
    .onConflictDoNothing()
}

/** 턴 차감이 취소되면 그 턴의 창작 보상도 회수한다. */
export async function revokeCreatorReward(tx: UsageTransaction, reservationId: string): Promise<void> {
  await tx.update(rechargeGrants).set({ status: 'revoked' })
    .where(and(eq(rechargeGrants.provider, CREATOR_REWARD_PROVIDER), eq(rechargeGrants.externalRef, reservationId)))
}

/** 내 캐릭터 화면의 창작 보상 요약 — 이번 달(한국 시간)·누적. */
export async function creatorRewardSummary(userId: string): Promise<{ month: number; total: number }> {
  const monthStart = sql`date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`
  const [row] = await db.select({
    total: sql<number>`coalesce(sum(${rechargeGrants.amount}), 0)::int`,
    month: sql<number>`coalesce(sum(${rechargeGrants.amount}) filter (where ${rechargeGrants.createdAt} >= ${monthStart}), 0)::int`,
  }).from(rechargeGrants)
    .where(and(eq(rechargeGrants.userId, userId), inArray(rechargeGrants.provider, [CREATOR_REWARD_PROVIDER, CHEER_PROVIDER]), eq(rechargeGrants.status, 'active'), gte(rechargeGrants.amount, 1)))
  return { month: row?.month ?? 0, total: row?.total ?? 0 }
}

export class CheerError extends Error {}

/**
 * 응원 보내기 — 보낸 사람 지갑에서 충전한 토큰만 차감하고(가입 선물·창작 보상 토큰은 안 된다 — 무료 토큰을 다른 계정으로 옮기는 통로를 막는다),
 * 만든 사람에게 70% 를 미로 토큰으로 준다. requestId 가 같으면 한 번만 처리된다.
 */
export async function sendCheer(opts: { userId: string; characterId: string; amount: number; requestId: string }): Promise<void> {
  if (!CHEER_AMOUNTS.includes(opts.amount as typeof CHEER_AMOUNTS[number])) throw new CheerError('invalid_amount')
  if (!/^[0-9a-f-]{36}$/i.test(opts.requestId)) throw new CheerError('invalid_request')
  const [c] = await db.select({ ownerId: characters.ownerId, isOfficial: characters.isOfficial, isPublic: characters.isPublic, deletedAt: characters.deletedAt })
    .from(characters).where(eq(characters.id, opts.characterId)).limit(1)
  if (!c || c.deletedAt || !c.isPublic || c.isOfficial || !c.ownerId) throw new CheerError('not_cheerable')
  if (c.ownerId === opts.userId) throw new CheerError('own_character')
  const ownerId = c.ownerId
  await db.transaction(async tx => {
    const reservation = await reserve({ userId: opts.userId, kind: 'cheer', tokenAmount: opts.amount, paidOnly: true, idempotencyKey: `cheer:${opts.userId}:${opts.requestId}` }, tx)
    if (reservation.reused) return
    await commit(reservation.reservationId, undefined, tx)
    await tx.insert(rechargeGrants).values({ userId: ownerId, amount: Math.floor(opts.amount * CHEER_SHARE), source: 'grant', provider: CHEER_PROVIDER, externalRef: reservation.reservationId })
      .onConflictDoNothing()
  })
}
