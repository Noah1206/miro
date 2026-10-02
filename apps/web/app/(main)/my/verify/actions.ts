'use server'
import { requireUser } from '@/lib/auth'
import { confirmAdult, type AdultVerifyOutcome } from '@/lib/adult-verify'
import { INTL_LOCALE, msg } from '@/lib/i18n'
import { getLanguage, getT } from '@/lib/i18n/server'

export type VerifyState = { error: string | null; done: boolean }

/** n64/n65 — 성인 인증(생년월일 폼). 실패 시 24시간 뒤 재시도 (명세서 7.1 예외). 정책 동의도 함께 기록한다. */
export async function verifyAdult(_p: VerifyState, form: FormData): Promise<VerifyState> {
  const user = await requireUser()
  if (form.get('agree') !== 'on') return { error: msg('성인 콘텐츠 사용 정책에 동의해 주세요.'), done: false }
  return toState(await confirmAdult(user.id, { birthDate: String(form.get('birthDate') ?? '') }))
}

/** PortOne 본인인증 창이 닫힌 뒤(PC). 결과는 서버가 PortOne 에서 다시 받는다 — 브라우저가 보낸 결과는 믿지 않는다. */
export async function confirmIdentity(identityVerificationId: string): Promise<VerifyState> {
  const user = await requireUser()
  return toState(await confirmAdult(user.id, { identityVerificationId: String(identityVerificationId) }))
}

async function toState(o: AdultVerifyOutcome): Promise<VerifyState> {
  if (o.ok) return { error: null, done: true }
  const [t, language] = await Promise.all([getT(), getLanguage()])
  const at = o.lockedUntil?.toLocaleString(INTL_LOCALE[language])
  return {
    error: !o.reason ? t('{at} 이후에 다시 시도할 수 있습니다.', { at: at ?? '' })
      : o.lockedUntil ? t('인증에 실패했습니다: {reason} 24시간 후 다시 시도할 수 있습니다.', { reason: o.reason })
      : t(o.reason),
    done: false,
  }
}
