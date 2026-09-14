'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { requireUser } from '@/lib/auth'

/** 표시 이름. 1–20자. 비우면 이메일 앞부분으로 돌아간다. */
export async function updateDisplayName(form: FormData): Promise<void> {
  const user = await requireUser()
  const name = String(form.get('displayName') ?? '').trim().slice(0, 20)
  await db.update(users).set({ displayName: name || null }).where(eq(users.id, user.id))
  revalidatePath('/my'); revalidatePath('/home')
}
