import { and, eq, gte, inArray, like, or, sql } from 'drizzle-orm'
import { characters, db, officialVoices, rechargeGrants, rechargeLedger, turnUndos, usageLedger, users } from '@miro/db'
import { commit, reserve, type UsageTransaction } from './guard'

/**
 * 창작 보상 1단계(11/11) — 다른 사람이 내 캐릭터와 대화하며 실제로 쓴 토큰의 일부를 만든 사람 지갑에 미로 토큰으로 적립한다(현금 아님).
 * 공식 캐릭터·자기 캐릭터와의 대화는 빼고, 턴 차감이 취소되면(리롤·실패) 같이 회수한다. 지급은 (provider, 예약 id) UNIQUE 로 한 번만.
 * 어뷰징은 가입 3일 미만·게스트 제외와 하루 상한으로 막는다. 유료 토큰으로 낸 몫의 보상만 수익(출금 가능)에 쌓인다.
 */
export const CREATOR_REWARD_RATE = 0.1
export const CREATOR_REWARD_PROVIDER = 'creator_reward'
/** 무료 토큰(월간 제공·출석·가입 선물)으로 한 대화의 보상 — 출금이 안 되니 수익이 아니라 일반 지갑으로 바로 들어간다. */
export const CREATOR_REWARD_FREE_PROVIDER = 'creator_reward_free'
const REWARD_PROVIDERS = [CREATOR_REWARD_PROVIDER, CREATOR_REWARD_FREE_PROVIDER]
/**
 * 목소리 보상(11/12) — 목소리만 올리는 크리에이터를 위해: 다른 회원이 내가 녹음해 공개한 목소리로 답을 들으면 그 턴에 쓴 토큰의 3% 를 목소리 주인에게.
 * 작품 보상(10%)과 같은 지갑·같은 규칙(유료 몫만 수익, 가입 3일 미만·게스트 제외, 하루 상한, 차감 취소 시 회수)이고 비율만 작다(사용자 결정 3%).
 * 한 턴에 여러 회원의 목소리가 쓰이면 3% 를 목소리 수로 나눈다. 운영자 목소리·자기 목소리로 들은 턴은 없다.
 */
export const VOICE_REWARD_RATE = 0.03
export const VOICE_REWARD_PROVIDER = 'voice_reward'
export const VOICE_REWARD_FREE_PROVIDER = 'voice_reward_free'
export const VOICE_REWARD_DAILY_CAP_PER_PAYER = 100
const VOICE_PROVIDERS = [VOICE_REWARD_PROVIDER, VOICE_REWARD_FREE_PROVIDER]
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
    where g.user_id = ${c.ownerId} and g.provider in (${CREATOR_REWARD_PROVIDER}, ${CREATOR_REWARD_FREE_PROVIDER}) and g.status = 'active' and l.user_id = ${opts.payerId} and g.created_at >= ${KST_DAY_START}`)
  const amount = Math.min(Math.floor(l.amount * CREATOR_REWARD_RATE), REWARD_DAILY_CAP_PER_PAYER - (today?.sum ?? 0))
  if (amount <= 0) return
  // 이 턴에서 충전 토큰으로 낸 몫의 10% 까지만 수익(출금 가능), 나머지는 일반 지갑.
  const [paid] = await tx.select({ n: sql<number>`coalesce(sum(${rechargeLedger.amount}), 0)::int` }).from(rechargeLedger)
    .innerJoin(rechargeGrants, and(eq(rechargeGrants.id, rechargeLedger.grantId), eq(rechargeGrants.source, 'purchase')))
    .where(eq(rechargeLedger.ledgerId, opts.reservationId))
  const earned = Math.min(amount, Math.floor((paid?.n ?? 0) * CREATOR_REWARD_RATE))
  const ref = refOf(opts.reservationId, opts.characterId)
  for (const [provider, n] of [[CREATOR_REWARD_PROVIDER, earned], [CREATOR_REWARD_FREE_PROVIDER, amount - earned]] as const) {
    if (n > 0) await tx.insert(rechargeGrants).values({ userId: c.ownerId, amount: n, source: 'grant', provider, externalRef: ref }).onConflictDoNothing()
  }
}

/** 턴 차감이 취소되면 그 턴의 창작 보상도 회수한다. */
export async function revokeCreatorReward(tx: UsageTransaction, reservationId: string): Promise<void> {
  await tx.update(rechargeGrants).set({ status: 'revoked' })
    .where(and(inArray(rechargeGrants.provider, [...REWARD_PROVIDERS, ...VOICE_PROVIDERS]), or(eq(rechargeGrants.externalRef, reservationId), like(rechargeGrants.externalRef, `${reservationId}|%`))))
}

/**
 * 목소리 보상 적립 — 답을 목소리로 들려준 뒤 부른다(/api/tts 한 턴 통째 경로). voices = 그 턴에 쓰인 엔진 쪽 목소리 id 들.
 * 그 턴의 차감 기록은 되돌리기 기록(turn_undos — 방마다 마지막 턴 하나)에서 찾는다: 방금 받은 답을 들을 때만 적립되고, 지난 답을 다시 들을 때는 없다.
 * 같은 턴·같은 목소리는 (provider, externalRef) UNIQUE 로 한 번만.
 */
export async function accrueVoiceReward(opts: { sessionId: string; messageId: string; payerId: string; voices: string[] }): Promise<void> {
  const ids = [...new Set(opts.voices.filter(Boolean))]
  if (!ids.length) return
  const owned = (await db.select({ id: officialVoices.id, ownerId: officialVoices.ownerId }).from(officialVoices)
    .where(and(inArray(officialVoices.providerVoiceId, ids), eq(officialVoices.status, 'active'))))
    .filter((v): v is { id: string; ownerId: string } => !!v.ownerId && v.ownerId !== opts.payerId)
  if (!owned.length) return
  await db.transaction(async tx => {
    const [undo] = await tx.select({ before: turnUndos.before }).from(turnUndos)
      .where(and(eq(turnUndos.sessionId, opts.sessionId), sql`${opts.messageId}::uuid = any(${turnUndos.messageIds})`)).limit(1)
    const reservationId = undo?.before.ledgerId
    if (!reservationId) return
    const [l] = await tx.select({ amount: usageLedger.amount, status: usageLedger.status, userId: usageLedger.userId }).from(usageLedger).where(eq(usageLedger.id, reservationId)).limit(1)
    if (!l || l.status !== 'committed' || l.userId !== opts.payerId) return
    const [payer] = await tx.select({ isGuest: users.isGuest, createdAt: users.createdAt }).from(users).where(eq(users.id, opts.payerId)).limit(1)
    if (!payer || payer.isGuest || Date.now() - payer.createdAt.getTime() < REWARD_NEW_ACCOUNT_DAYS * 86_400_000) return
    const [paid] = await tx.select({ n: sql<number>`coalesce(sum(${rechargeLedger.amount}), 0)::int` }).from(rechargeLedger)
      .innerJoin(rechargeGrants, and(eq(rechargeGrants.id, rechargeLedger.grantId), eq(rechargeGrants.source, 'purchase')))
      .where(eq(rechargeLedger.ledgerId, reservationId))
    const share = (n: number) => Math.floor(n * VOICE_REWARD_RATE / owned.length)
    for (const voice of owned) {
      const [today] = await tx.execute<{ sum: number }>(sql`select coalesce(sum(g.amount), 0)::int as sum from ${rechargeGrants} g
        join ${usageLedger} l on l.id::text = split_part(g.external_ref, '|', 1)
        where g.user_id = ${voice.ownerId} and g.provider in (${VOICE_REWARD_PROVIDER}, ${VOICE_REWARD_FREE_PROVIDER}) and g.status = 'active' and l.user_id = ${opts.payerId} and g.created_at >= ${KST_DAY_START}`)
      const amount = Math.min(share(l.amount), VOICE_REWARD_DAILY_CAP_PER_PAYER - (today?.sum ?? 0))
      if (amount <= 0) continue
      const earned = Math.min(amount, share(paid?.n ?? 0))
      const ref = `${reservationId}|voice:${voice.id}`
      for (const [provider, n] of [[VOICE_REWARD_PROVIDER, earned], [VOICE_REWARD_FREE_PROVIDER, amount - earned]] as const) {
        if (n > 0) await tx.insert(rechargeGrants).values({ userId: voice.ownerId, amount: n, source: 'grant', provider, externalRef: ref }).onConflictDoNothing()
      }
    }
  })
}

/** 내 음성 화면의 목소리 보상 요약 — 이번 달(한국 시간)·누적. */
export async function voiceRewardSummary(userId: string): Promise<{ month: number; total: number }> {
  const monthStart = sql`date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`
  const [row] = await db.select({
    total: sql<number>`coalesce(sum(${rechargeGrants.amount}), 0)::int`,
    month: sql<number>`coalesce(sum(${rechargeGrants.amount}) filter (where ${rechargeGrants.createdAt} >= ${monthStart}), 0)::int`,
  }).from(rechargeGrants).where(and(eq(rechargeGrants.userId, userId), inArray(rechargeGrants.provider, VOICE_PROVIDERS), eq(rechargeGrants.status, 'active')))
  return { month: row?.month ?? 0, total: row?.total ?? 0 }
}

/** 내 캐릭터 화면의 창작 보상 요약 — 이번 달(한국 시간)·누적. */
export async function creatorRewardSummary(userId: string): Promise<{ month: number; total: number }> {
  const monthStart = sql`date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`
  const [row] = await db.select({
    total: sql<number>`coalesce(sum(${rechargeGrants.amount}), 0)::int`,
    month: sql<number>`coalesce(sum(${rechargeGrants.amount}) filter (where ${rechargeGrants.createdAt} >= ${monthStart}), 0)::int`,
  }).from(rechargeGrants)
    .where(and(eq(rechargeGrants.userId, userId), inArray(rechargeGrants.provider, [...REWARD_PROVIDERS, CHEER_PROVIDER]), eq(rechargeGrants.status, 'active'), gte(rechargeGrants.amount, 1)))
  return { month: row?.month ?? 0, total: row?.total ?? 0 }
}

export class CheerError extends Error {}

/**
 * 응원 보내기 — 보낸 사람 지갑에서 충전한 토큰만 차감하고(가입 선물·창작 보상 토큰은 안 된다 — 무료 토큰을 다른 계정으로 옮기는 통로를 막는다),
 * 만든 사람에게 70% 를 미로 토큰으로 준다. requestId 가 같으면 한 번만 처리된다.
 */
/** 처리했으면 알림용 정보(만든 사람·캐릭터·받은 양), 같은 requestId 로 이미 처리된 거면 null. */
export async function sendCheer(opts: { userId: string; characterId: string; amount: number; requestId: string }): Promise<{ ownerId: string; characterName: string; images: string[]; earned: number } | null> {
  if (!CHEER_AMOUNTS.includes(opts.amount as typeof CHEER_AMOUNTS[number])) throw new CheerError('invalid_amount')
  if (!/^[0-9a-f-]{36}$/i.test(opts.requestId)) throw new CheerError('invalid_request')
  const [c] = await db.select({ ownerId: characters.ownerId, isOfficial: characters.isOfficial, isPublic: characters.isPublic, deletedAt: characters.deletedAt, name: characters.name, images: characters.images })
    .from(characters).where(eq(characters.id, opts.characterId)).limit(1)
  if (!c || c.deletedAt || !c.isPublic || c.isOfficial || !c.ownerId) throw new CheerError('not_cheerable')
  if (c.ownerId === opts.userId) throw new CheerError('own_character')
  const ownerId = c.ownerId
  const earned = Math.floor(opts.amount * CHEER_SHARE)
  const done = await db.transaction(async tx => {
    const reservation = await reserve({ userId: opts.userId, kind: 'cheer', tokenAmount: opts.amount, paidOnly: true, idempotencyKey: `cheer:${opts.userId}:${opts.requestId}` }, tx)
    if (reservation.reused) return false
    await commit(reservation.reservationId, undefined, tx)
    await tx.insert(rechargeGrants).values({ userId: ownerId, amount: earned, source: 'grant', provider: CHEER_PROVIDER, externalRef: refOf(reservation.reservationId, opts.characterId) })
      .onConflictDoNothing()
    return true
  })
  return done ? { ownerId, characterName: c.name, images: c.images ?? [], earned } : null
}

/** 작품별 이번 달(한국 시간) 수익 — 대화 보상과 받은 응원을 따로. 캐릭터 id → 값. */
export async function creatorRewardByCharacter(userId: string): Promise<Map<string, { reward: number; cheer: number }>> {
  const monthStart = sql`date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`
  const rows = await db.execute<{ character: string; reward: number; cheer: number }>(sql`select split_part(external_ref, '|', 2) as character,
      coalesce(sum(amount) filter (where provider <> ${CHEER_PROVIDER}), 0)::int as reward,
      coalesce(sum(amount) filter (where provider = ${CHEER_PROVIDER}), 0)::int as cheer
    from ${rechargeGrants} where user_id = ${userId} and status = 'active' and provider in (${CREATOR_REWARD_PROVIDER}, ${CREATOR_REWARD_FREE_PROVIDER}, ${CHEER_PROVIDER})
      and created_at >= ${monthStart} and external_ref like '%|%'
    group by 1`)
  return new Map([...rows].map(r => [r.character, { reward: r.reward, cheer: r.cheer }]))
}
