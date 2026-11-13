'use client'
import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { WELCOME_PARAM, withWelcome } from '@/lib/onboarding-options'
import { AdultVerificationPanel } from '@/components/adult-verification-panel'
import type { adultVerificationState } from '@/app/(main)/my/verify/actions'

/** 인증이 끝나면 보던 곳(없으면 홈)으로. 모바일은 PortOne 창이 /my/verify/return?next=/onboarding/verify… 로 돌려보낸다. */
export function SignupVerify({ state, welcome, dest }: { state: Awaited<ReturnType<typeof adultVerificationState>>; welcome: boolean; dest: string }) {
  const router = useRouter()
  // 11/13 인증이 끝나면 로그인 전에 보던 곳(dest)으로 — 홈으로만 보내면 보러 온 작품을 잃는다.
  const done = useCallback(() => router.replace(welcome ? withWelcome(dest) : dest), [router, welcome, dest])
  const back = `/onboarding/verify?${welcome ? `${WELCOME_PARAM}=1&` : ''}next=${encodeURIComponent(dest)}`
  return <AdultVerificationPanel state={state} onDone={done} returnTo={back} />
}
