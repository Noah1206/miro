import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { db, termsConsents } from '@miro/db'
import { eq } from 'drizzle-orm'

/**
 * 앱 최초 실행(n1) → 언제나 Home.
 * 로그인은 입장할 때 요구한다 — 먼저 무엇이 있는지 보여주고 나서 묻는다 (E-48).
 */
export default async function Root() {
  const user = await currentUser()
  if (user) {
    const consent = await db.select({ id: termsConsents.id }).from(termsConsents)
      .where(eq(termsConsents.userId, user.id)).limit(1)
    if (consent.length === 0) redirect('/terms')
  }
  redirect('/home')
}
