'use server'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { takeNext } from '@/lib/oauth-state'
import { completeOnboarding, parseOnboarding, type OnboardingError } from '@/lib/onboarding'
import { WELCOME_PARAM } from '@/lib/onboarding-options'

export type OnboardingState = OnboardingError | null

/** 온보딩 완료. 틀린 칸이 있으면 그 단계로 돌려보낸다. 끝나면 로그인 전에 보던 곳(없으면 홈)으로 — 보상을 줬으면 환영 시트를 띄운다. */
export async function finishOnboarding(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const user = await requireUser()
  const parsed = parseOnboarding(form)
  if (!parsed.ok) return { step: parsed.step, error: parsed.error }
  const done = await completeOnboarding(user.id, parsed.input)
  if (!done.ok) return { step: done.step, error: done.error }
  const next = (await takeNext()) ?? '/home'
  redirect(done.welcomed ? `${next}${next.includes('?') ? '&' : '?'}${WELCOME_PARAM}=1` : next)
}
