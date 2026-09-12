'use server'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { canRetryVerification, verifyRetryAt } from '@miro/domain'
import { resolveAdultVerification } from '@miro/providers'
import { requireUser } from '@/lib/auth'

export type VerifyState = { error: string | null; done: boolean }

/** n64/n65 — 성인 인증. 실패 시 24시간 뒤 재시도 (명세서 7.1 예외). 정책 동의도 함께 기록한다. */
export async function verifyAdult(_p: VerifyState, form: FormData): Promise<VerifyState> {
  const user = await requireUser()
  const [u] = await db.select({ failedAt: users.adultVerifyFailedAt, verifiedAt: users.adultVerifiedAt }).from(users).where(eq(users.id, user.id)).limit(1)
  if (u?.verifiedAt) return { error: null, done: true }
  const now = new Date()
  if (!canRetryVerification(u?.failedAt ?? null, now)) {
    return { error: `${verifyRetryAt(u!.failedAt)!.toLocaleString('ko-KR')} 이후에 다시 시도할 수 있습니다.`, done: false }
  }
  if (form.get('agree') !== 'on') return { error: '성인 콘텐츠 사용 정책에 동의해 주세요.', done: false }

  const provider = resolveAdultVerification()
  const result = await provider.verify({ userId: user.id, birthDate: String(form.get('birthDate') ?? '') })
  if (!result.verified) {
    await db.update(users).set({ adultVerifyFailedAt: now }).where(eq(users.id, user.id))
    return { error: `인증에 실패했습니다: ${result.reason} 24시간 후 다시 시도할 수 있습니다.`, done: false }
  }
  await db.update(users).set({ adultVerifiedAt: now, maturePolicyAgreedAt: now, adultVerifyFailedAt: null }).where(eq(users.id, user.id))
  revalidatePath('/my/verify')
  return { error: null, done: true }
}
