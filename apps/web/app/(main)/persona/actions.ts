'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { PERSONA_LATER, personaNext, savePersona } from '@/lib/persona'

export type PersonaFormState = { error: string; canSkip?: true } | null

/** 저장하고 원래 가려던 대화(또는 마이페이지)로 돌아간다. 실패하면 화면에 남아 이유를 보인다. */
export async function savePersonaAction(_prev: PersonaFormState, form: FormData): Promise<PersonaFormState> {
  const user = await requireUser()
  const result = await savePersona(user.id, { name: form.get('name'), gender: form.get('gender'), description: form.get('description') })
  if (!result.ok) return result.canSkip ? { error: result.error, canSkip: true } : { error: result.error }
  revalidatePath('/my')
  redirect(personaNext(form.get('next')))
}

/** 안전 검사를 못 해 저장이 막혔을 때만 화면에 나오는 '이번에는 건너뛰기'. 이 브라우저 세션 동안 관문을 열어 둔다. */
export async function skipPersonaAction(form: FormData): Promise<void> {
  await requireUser()
  ;(await cookies()).set(PERSONA_LATER, '1', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
  redirect(personaNext(form.get('next')))
}
