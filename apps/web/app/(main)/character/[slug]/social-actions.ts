'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { characters, db } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { addComment, removeComment, toggleBookmark } from '@/lib/social'

async function characterIdOf(slug: string): Promise<string | null> {
  const [c] = await db.select({ id: characters.id }).from(characters).where(eq(characters.slug, slug)).limit(1)
  return c?.id ?? null
}

/** 비로그인 사용자는 로그인으로 보내되, 보던 캐릭터로 돌아오게 한다 (E-48). */
function loginThenBack(slug: string): never {
  redirect(`/login?next=${encodeURIComponent(`/character/${slug}`)}`)
}

export async function postComment(slug: string, form: FormData): Promise<void> {
  const user = await currentUser()
  if (!user) loginThenBack(slug)
  const id = await characterIdOf(slug)
  if (!id) return
  await addComment(id, user.id, String(form.get('body') ?? ''))
  revalidatePath(`/character/${slug}`)
}

export async function deleteComment(slug: string, commentId: string): Promise<void> {
  const user = await currentUser()
  if (!user) loginThenBack(slug)
  await removeComment(commentId, user.id)
  revalidatePath(`/character/${slug}`)
}

export async function bookmark(slug: string): Promise<void> {
  const user = await currentUser()
  if (!user) loginThenBack(slug)
  const id = await characterIdOf(slug)
  if (!id) return
  await toggleBookmark(id, user.id)
  revalidatePath(`/character/${slug}`)
}
