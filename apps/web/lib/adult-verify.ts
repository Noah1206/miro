import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { canRetryVerification, verifyRetryAt } from '@miro/domain'
import { resolveAdultVerification } from '@miro/providers'

/** 본인인증 건 id 는 계정에 묶는다 — 한 사람의 인증 건을 다른 계정이 가져다 쓰지 못하게(브라우저가 이 접두어로 만들고 서버가 확인한다). */
export const verificationPrefix = (userId: string) => `iv-${userId.replaceAll('-', '')}-`

export type AdultVerifyOutcome = { ok: true } | { ok: false; reason: string | null; lockedUntil: Date | null }

/**
 * 성인 인증 한 번 — 생년월일 폼(Mock)·PortOne 창(PC)·PortOne 되돌아오기(모바일)가 모두 이 길로 온다.
 * 미성년 결과는 24시간 잠그고(명세서 7.1), 창을 닫았거나 공급자 장애면 잠그지 않는다. 성공하면 정책 동의도 함께 기록한다.
 */
export async function confirmAdult(userId: string, req: { birthDate?: string; identityVerificationId?: string }, now = new Date()): Promise<AdultVerifyOutcome> {
  const [u] = await db.select({ failedAt: users.adultVerifyFailedAt, verifiedAt: users.adultVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1)
  if (u?.verifiedAt) return { ok: true }
  if (!canRetryVerification(u?.failedAt ?? null, now)) return { ok: false, reason: null, lockedUntil: verifyRetryAt(u!.failedAt) }
  if (req.identityVerificationId && !req.identityVerificationId.startsWith(verificationPrefix(userId))) {
    return { ok: false, reason: '본인인증 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.', lockedUntil: null }
  }
  const result = await resolveAdultVerification().verify({ userId, ...req })
  if (!result.verified) {
    if (result.lock) await db.update(users).set({ adultVerifyFailedAt: now }).where(eq(users.id, userId))
    return { ok: false, reason: result.reason, lockedUntil: result.lock ? verifyRetryAt(now) : null }
  }
  await db.update(users).set({ adultVerifiedAt: now, maturePolicyAgreedAt: now, adultVerifyFailedAt: null }).where(eq(users.id, userId))
  return { ok: true }
}
