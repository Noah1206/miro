import { and, eq, gte, inArray, like, or, sql } from 'drizzle-orm'
import { characters, db, rechargeGrants, usageLedger, users } from '@miro/db'
import { commit, reserve, type UsageTransaction } from './guard'

/**
 * 창작 보상 1단계(11/11) — 다른 사람이 내 캐릭터와 대화하며 실제로 쓴 토큰의 일부를 만든 사람 지갑에 미로 토큰으로 적립한다(현금 아님).
 * 공식 캐릭터·자기 캐릭터와의 대화는 빼고, 턴 차감이 취소되면(리롤·실패) 같이 회수한다. 지급은 (provider, 예약 id) UNIQUE 로 한 번만.
 * ponytail: 여러 계정으로 자기 작품을 돌리는 어뷰징은 막지 않는다 — 앱 안 토큰이라 피해가 작다. 현금 정산(3단계) 전에는 계정·기기 기준 상한을 둔다.
 */
export const CREATOR_REWARD_RATE = 0.1
export const CREATOR_REWARD_PROVIDER = 'creator_reward'
/** 11/11 어뷰징 막기 — 한 사람이 같은 크리에이터에게 하루(한국 시간)에 만들어 줄 수 있는 대화 보상 상한, 보상에서 빼는 새 계정 기간. */
export const REWARD_DAILY_CAP_PER_PAYER = 300
export const REWARD_NEW_ACCOUNT_DAYS = 3
/** 보상 기록의 externalRef = '예약 id|캐릭터 id' — 예약 id 로 한 번만 지급하고, 캐릭터 id 로 작품별 수익을 묶는다. */
const refOf = (reservationId: string, characterId: string) => `${reservationId}|${characterId}`
const KST_DAY_START = sql`date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`
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
  // 게스트·가입 직후 계정의 대화는 보상하지 않는다 — 계정을 새로 만들어 자기 작품을 돌리는 걸 막는다.
  const [payer] = await tx.select({ isGuest: users.isGuest, createdAt: users.createdAt }).from(users).where(eq(users.id, opts.payerId)).limit(1)
  if (!payer || payer.isGuest || Date.now() - payer.createdAt.getTime() < REWARD_NEW_ACCOUNT_DAYS * 86_400_000) return
  // 한 사람 → 같은 크리에이터 하루 상한. 보낸 사람(예약의 주인)은 기록의 예약 id 로 찾는다.
  const [today] = await tx.execute<{ sum: number }>(sql`select coalesce(sum(g.amount), 0)::int as sum from ${rechargeGrants} g
    join ${usageLedger} l on l.id::text = split_part(g.external_ref, '|', 1)
    where g.user_id = ${c.ownerId} and g.provider = ${CREATOR_REWARD_PROVIDER} and g.status = 'active' and l.user_id = ${opts.payerId} and g.created_at >= ${KST_DAY_START}`)
  const amount = Math.min(Math.floor(l.amount * CREATOR_REWARD_RATE), REWARD_DAILY_CAP_PER_PAYER - (today?.sum ?? 0))
  if (amount <= 0) return
  await tx.insert(rechargeGrants).values({ userId: c.ownerId, amount, source: 'grant', provider: CREATOR_REWARD_PROVIDER, externalRef: refOf(opts.reservationId, opts.characterId) })
    .onConflictDoNothing()
}

/** 턴 차감이 취소되면 그 턴의 창작 보상도 회수한다. */
export async function revokeCreatorReward(tx: UsageTransaction, reservationId: string): Promise<void> {
  await tx.update(rechargeGrants).set({ status: 'revoked' })
    .where(and(eq(rechargeGrants.provider, CREATOR_REWARD_PROVIDER), or(eq(rechargeGrants.externalRef, reservationId), like(rechargeGrants.externalRef, `${reservationId}|%`))))
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
    await tx.insert(rechargeGrants).values({ userId: ownerId, amount: Math.floor(opts.amount * CHEER_SHARE), source: 'grant', provider: CHEER_PROVIDER, externalRef: refOf(reservation.reservationId, opts.characterId) })
      .onConflictDoNothing()
  })
}

/** 작품별 이번 달(한국 시간) 수익 — 대화 보상과 받은 응원을 따로. 캐릭터 id → 값. */
export async function creatorRewardByCharacter(userId: string): Promise<Map<string, { reward: number; cheer: number }>> {
  const monthStart = sql`date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`
  const rows = await db.execute<{ character: string; reward: number; cheer: number }>(sql`select split_part(external_ref, '|', 2) as character,
      coalesce(sum(amount) filter (where provider = ${CREATOR_REWARD_PROVIDER}), 0)::int as reward,
      coalesce(sum(amount) filter (where provider = ${CHEER_PROVIDER}), 0)::int as cheer
    from ${rechargeGrants} where user_id = ${userId} and status = 'active' and provider in (${CREATOR_REWARD_PROVIDER}, ${CHEER_PROVIDER})
      and created_at >= ${monthStart} and external_ref like '%|%'
    group by 1`)
  return new Map([...rows].map(r => [r.character, { reward: r.reward, cheer: r.cheer }]))
}
