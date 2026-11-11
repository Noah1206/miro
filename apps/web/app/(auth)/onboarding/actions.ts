'use server'
import { visitorConsent } from '@/lib/visitor-consent'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { takeNext } from '@/lib/oauth-state'
import { completeOnboarding, parseOnboarding, precheckNickname, type OnboardingError } from '@/lib/onboarding'
import { WELCOME_PARAM } from '@/lib/onboarding-options'
import { teenOpen } from '@/lib/teen-open'

export type OnboardingState = OnboardingError | null

/** 닉네임 단계를 넘길 때 뒤에서 페르소나로 미리 저장한다 — 막히면(길이·빈 값) 이유를 돌려준다. */
export async function checkNickname(nickname: string) {
  const user = await requireUser()
  return precheckNickname(user.id, nickname)
}

/** 온보딩 완료. 틀린 칸이 있으면 그 단계로 돌려보낸다. 끝나면 로그인 전에 보던 곳(없으면 홈)으로 — 보상을 줬으면 환영 시트를 띄운다. */
export async function finishOnboarding(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const user = await requireUser()
  const receipt = await visitorConsent()
  const parsed = parseOnboarding(form)
  if (!parsed.ok) return { step: parsed.step, error: parsed.error }
  const done = await completeOnboarding(user.id, parsed.input, receipt?.at)
  if (!done.ok) return { step: done.step, error: done.error }
  const next = (await takeNext()) ?? '/home'
  // 11/12: 청소년 개방 약관 시행일부터는 본인인증 단계 없이 바로 홈 — 그 전에는 본인인증 단계로(가입 선물 표시는 그 단계를 지나 홈까지).
  redirect(done.welcomed ? (teenOpen() ? `/home?${WELCOME_PARAM}=1` : `/onboarding/verify?${WELCOME_PARAM}=1`) : next)
}
