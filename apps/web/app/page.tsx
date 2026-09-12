import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { db, termsConsents } from '@miro/db'
import { eq } from 'drizzle-orm'

/** 앱 최초 실행(n1) → 온보딩/로그인 또는 Home 분기. */
export default async function Root() {
  const user = await currentUser()
  if (!user) redirect('/onboarding')

  const consent = await db.select({ id: termsConsents.id }).from(termsConsents)
    .where(eq(termsConsents.userId, user.id)).limit(1)
  if (consent.length === 0) redirect('/terms')

  redirect('/home')
}
