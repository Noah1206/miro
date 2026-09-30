'use server'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { takeNext } from '@/lib/oauth-state'
import { completeOnboarding, parseOnboarding, precheckNickname, type OnboardingError } from '@/lib/onboarding'
import { WELCOME_PARAM } from '@/lib/onboarding-options'

export type OnboardingState = OnboardingError | null

/** 닉네임 단계를 넘길 때 뒤에서 안전 검사를 미리 한다 — 마지막 '시작하기' 가 AI 호출을 기다리지 않게(2026-09-30). */
export async function checkNickname(nickname: string) {
  const user = await requireUser()
  return precheckNickname(user.id, nickname)
}

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
