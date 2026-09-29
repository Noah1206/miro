import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, termsConsents } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { Page } from '@/components/ui'
import { OnboardingForm } from './form'

/** 첫 소셜 로그인 직후 한 번(약관 동의가 없는 사용자). 동의를 마친 사용자는 홈으로. */
export default async function OnboardingPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const consent = await db.select({ id: termsConsents.id }).from(termsConsents).where(eq(termsConsents.userId, user.id)).limit(1)
  if (consent.length > 0) redirect('/home')
  return (
    <Page style={{ maxWidth: 480, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <OnboardingForm />
    </Page>
  )
}
