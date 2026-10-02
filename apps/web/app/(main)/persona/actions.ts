'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { personaNext, savePersona } from '@/lib/persona'

export type PersonaFormState = { error: string } | null

/** 저장하고 원래 가려던 대화(또는 마이페이지)로 돌아간다. 실패하면 화면에 남아 이유를 보인다. */
export async function savePersonaAction(_prev: PersonaFormState, form: FormData): Promise<PersonaFormState> {
  const user = await requireUser()
  const result = await savePersona(user.id, { name: form.get('name'), gender: form.get('gender'), description: form.get('description') })
  if (!result.ok) return { error: result.error }
  revalidatePath('/my')
  redirect(personaNext(form.get('next')))
}
