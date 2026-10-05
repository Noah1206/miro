'use server'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, termsConsents } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { privacyVersion } from '@/lib/legal'
import { takeNext } from '@/lib/oauth-state'

/** 국외 이전 별도 동의(기존 회원). 체크 없이 제출하면 같은 화면에 이유를 보인다. 동의하면 로그인 전에 보던 곳(없으면 홈)으로. */
export async function agreeTransfer(form: FormData): Promise<void> {
  const user = await requireUser()
  if (form.get('transfer') !== 'on') redirect('/onboarding/transfer?error=1')
  await db.update(termsConsents).set({ transferVersion: privacyVersion() }).where(eq(termsConsents.userId, user.id))
  redirect((await takeNext()) ?? '/home')
}
