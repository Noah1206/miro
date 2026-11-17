import { randomInt } from 'node:crypto'
import { and, count, eq, gte, isNull } from 'drizzle-orm'
import { db, rechargeGrants, referralCodes, referrals, roleplaySessions, users } from '@miro/db'
import { REFERRAL_GRANT } from '@miro/config'

/**
 * 11/18 추천인 코드 — 회원마다 코드 하나. 친구가 프로필 쿠폰 칸에 넣으면 친구는 바로 1,000, 추천인은 친구가 대화 3턴을 하면 2,000.
 * 지급은 무료 토큰(recharge_grants source 'grant', provider 'referral'/'referral_bonus', external_ref = 친구 id)이라 같은 친구로 두 번 지급되지 않는다.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // 헷갈리는 0·O·1·I 는 뺀다
const DAY = 86_400_000

export type MyReferral = { code: string; friends: number; rewarded: number }

/** 내 코드(없으면 만든다)와 추천한 친구 수·보상 받은 수. */
export async function myReferral(userId: string): Promise<MyReferral> {
  let [row] = await db.select({ code: referralCodes.code }).from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1)
  for (let i = 0; !row && i < 5; i++) {
    const code = Array.from({ length: 7 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
    await db.insert(referralCodes).values({ userId, code }).onConflictDoNothing()
    ;[row] = await db.select({ code: referralCodes.code }).from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1)
  }
  if (!row) throw new Error('referral_code_failed')
  const [stat] = await db.select({ friends: count(), rewarded: count(referrals.rewardedAt) }).from(referrals).where(eq(referrals.referrerId, userId))
  return { code: row.code, friends: stat?.friends ?? 0, rewarded: stat?.rewarded ?? 0 }
}

export type ReferralResult = { ok: true; units: number } | { ok: false; error: 'self' | 'too_late' | 'referred' } | null

/** 추천인 코드 적용. 추천인 코드가 아니면 null(쿠폰 칸이 '없는 코드'로 처리). */
export async function applyReferral(userId: string, code: string, now = new Date()): Promise<ReferralResult> {
  const [ref] = await db.select({ referrerId: referralCodes.userId }).from(referralCodes).where(eq(referralCodes.code, code)).limit(1)
  if (!ref) return null
  if (ref.referrerId === userId) return { ok: false, error: 'self' }
  const [me] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1)
  if (!me || now.getTime() - me.createdAt.getTime() > REFERRAL_GRANT.joinWindowDays * DAY) return { ok: false, error: 'too_late' }
  const added = await db.transaction(async tx => {
    const [row] = await tx.insert(referrals).values({ refereeId: userId, referrerId: ref.referrerId }).onConflictDoNothing().returning({ id: referrals.refereeId })
    if (!row) return false
    await tx.insert(rechargeGrants).values({ userId, amount: REFERRAL_GRANT.referee, source: 'grant', provider: 'referral', externalRef: userId,
      expiresAt: new Date(now.getTime() + REFERRAL_GRANT.validDays * DAY) }).onConflictDoNothing()
    return true
  })
  if (!added) return { ok: false, error: 'referred' }
  // 코드를 넣기 전에 이미 3턴을 넘긴 친구면 추천인 보상도 바로.
  const [done] = await db.select({ id: roleplaySessions.id }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.userId, userId), gte(roleplaySessions.turnCount, REFERRAL_GRANT.afterTurns))).limit(1)
  if (done) await rewardReferrer(userId, now)
  return { ok: true, units: REFERRAL_GRANT.referee }
}

/** 친구가 대화 3턴에 닿았을 때 — 추천인에게 한 번만 2,000. */
export async function rewardReferrer(refereeId: string, now = new Date()): Promise<void> {
  await db.transaction(async tx => {
    const [r] = await tx.update(referrals).set({ rewardedAt: now }).where(and(eq(referrals.refereeId, refereeId), isNull(referrals.rewardedAt)))
      .returning({ referrerId: referrals.referrerId })
    if (!r) return
    await tx.insert(rechargeGrants).values({ userId: r.referrerId, amount: REFERRAL_GRANT.referrer, source: 'grant', provider: 'referral_bonus', externalRef: refereeId,
      expiresAt: new Date(now.getTime() + REFERRAL_GRANT.validDays * DAY) }).onConflictDoNothing()
  })
}

