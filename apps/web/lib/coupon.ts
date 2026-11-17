import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'
import { coupons, db, rechargeGrants } from '@miro/db'

/**
 * 11/18 이벤트 쿠폰 — 프로필에서 코드를 넣으면 토큰을 준다(무료 토큰이라 출금되는 수익에는 안 잡힌다: source 'grant').
 * 받은 기록은 지급 행(provider 'coupon', external_ref '사용자:코드')이 곧 집계다.
 * 한 트랜잭션에서 사용 수를 먼저 올리고(선착순 상한·마감 확인) 지급한다 — 이미 받은 계정이면 지급이 막혀 사용 수도 되돌린다.
 */
export type RedeemResult = { ok: true; units: number; validDays: number } | { ok: false; error: 'empty' | 'unknown' | 'closed' | 'used' }

class AlreadyUsed extends Error {}

export async function redeemCoupon(userId: string, raw: string, now = new Date()): Promise<RedeemResult> {
  const code = raw.trim().toUpperCase().replace(/\s+/g, '').slice(0, 40)
  if (!code) return { ok: false, error: 'empty' }
  try {
    const got = await db.transaction(async tx => {
      const [c] = await tx.update(coupons).set({ uses: sql`${coupons.uses} + 1` })
        .where(and(eq(coupons.code, code), or(isNull(coupons.endsAt), gt(coupons.endsAt, now)), or(isNull(coupons.maxUses), lt(coupons.uses, coupons.maxUses))))
        .returning({ units: coupons.units, validDays: coupons.validDays })
      if (!c) return null
      const [grant] = await tx.insert(rechargeGrants).values({ userId, amount: c.units, source: 'grant', provider: 'coupon', externalRef: `${userId}:${code}`,
        expiresAt: new Date(now.getTime() + c.validDays * 86_400_000) }).onConflictDoNothing().returning({ id: rechargeGrants.id })
      if (!grant) throw new AlreadyUsed()
      return c
    })
    if (!got) {
      const [exists] = await db.select({ code: coupons.code }).from(coupons).where(eq(coupons.code, code)).limit(1)
      return { ok: false, error: exists ? 'closed' : 'unknown' }
    }
    return { ok: true, units: got.units, validDays: got.validDays }
  } catch (e) {
    if (e instanceof AlreadyUsed) return { ok: false, error: 'used' }
    throw e
  }
}
