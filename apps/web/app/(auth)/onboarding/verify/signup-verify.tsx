'use client'
import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { WELCOME_PARAM } from '@/lib/onboarding-options'
import { AdultVerificationPanel } from '@/components/adult-verification-panel'
import type { adultVerificationState } from '@/app/(main)/my/verify/actions'

/** 인증이 끝나면 홈으로. 모바일은 PortOne 창이 /my/verify/return?next=/onboarding/verify 로 돌려보낸다. */
export function SignupVerify({ state, welcome }: { state: Awaited<ReturnType<typeof adultVerificationState>>; welcome: boolean }) {
  const router = useRouter()
  const done = useCallback(() => router.replace(welcome ? `/home?${WELCOME_PARAM}=1` : '/home'), [router, welcome])
  return <AdultVerificationPanel state={state} onDone={done} returnTo={welcome ? `/onboarding/verify?${WELCOME_PARAM}=1` : '/onboarding/verify'} />
}
