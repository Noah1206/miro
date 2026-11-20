import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { resolveAdultVerification } from '@miro/providers'
import { verificationPrefix } from '@/lib/adult-verify'
import { msg } from '@/lib/i18n'

const UNCONFIRMED = msg('본인인증 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')

/**
 * 11/20 만 14세 미만 가입의 보호자(법정대리인) 동의 — 「개인정보 보호법」 제22조의2.
 * 보호자가 아이의 기기에서 휴대전화 본인인증을 하고, 서버가 그 결과를 PortOne 에서 다시 받아 성인인지 본다(브라우저가 보낸 결과는 믿지 않는다).
 * 아이 계정의 성인 인증(adultVerifiedAt)과는 따로다 — 여기서는 동의 시각과 보호자 DI 의 해시만 남기고, 24시간 잠금도 걸지 않는다(아이가 실수로 자기 폰으로 해도 다시 하면 된다).
 */
export async function confirmGuardian(userId: string, req: { identityVerificationId?: string; birthDate?: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (req.identityVerificationId && !req.identityVerificationId.startsWith(verificationPrefix(userId))) return { ok: false, reason: UNCONFIRMED }
  const result = await resolveAdultVerification().verify({ userId, ...req })
  // 성인이 아닌 결과(lock) = 아이 본인의 휴대전화로 인증했다.
  if (!result.verified) return { ok: false, reason: result.lock ? msg('보호자(성인)의 휴대전화로 인증해 주세요.') : result.reason }
  const di = result.di ? 'sha256:' + createHash('sha256').update(result.di).digest('hex') : null
  await db.update(users).set({ guardianConsentAt: new Date(), guardianConsentDi: di }).where(and(eq(users.id, userId), eq(users.under14, true)))
  return { ok: true }
}
