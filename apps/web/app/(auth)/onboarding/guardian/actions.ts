'use server'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { confirmGuardian } from '@/lib/guardian'
import { getT } from '@/lib/i18n/server'

/** PC: PortOne 창이 닫힌 뒤 결과 확인. 개발(Mock): 보호자 생년월일. */
export async function confirmGuardianAction(input: { identityVerificationId?: string; birthDate?: string }): Promise<{ error: string } | never> {
  const user = await requireUser()
  const r = await confirmGuardian(user.id, input)
  if (!r.ok) return { error: (await getT())(r.reason) }
  redirect('/home')
}
