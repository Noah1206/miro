import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { consentRedirect } from '@/lib/consent-gate'
import { Page } from '@/components/ui'
import { OnboardingForm } from './form'

/** 첫 소셜 로그인 직후 한 번(약관 동의가 없는 사용자). 동의를 마친 사용자는 홈으로(국외 이전 동의만 남았으면 그 화면으로). */
export default async function OnboardingPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const pending = await consentRedirect(user.id)
  if (pending !== '/onboarding') redirect(pending ?? '/home')
  return (
    <Page style={{ maxWidth: 480, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <OnboardingForm />
    </Page>
  )
}
