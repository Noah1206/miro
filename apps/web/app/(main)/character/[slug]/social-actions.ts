'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { characters, db } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { addComment, removeComment, toggleBookmark, toggleCommentLike } from '@/lib/social'

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
  const parentId = String(form.get('parentId') ?? '') || null
  await addComment(id, user.id, String(form.get('body') ?? ''), parentId)
  revalidatePath(`/character/${slug}`)
  revalidatePath(`/character/${slug}/comments`)
}

export async function likeComment(slug: string, commentId: string): Promise<void> {
  const user = await currentUser()
  if (!user) loginThenBack(slug)
  await toggleCommentLike(commentId, user.id)
  revalidatePath(`/character/${slug}`)
  revalidatePath(`/character/${slug}/comments`)
}

export async function deleteComment(slug: string, commentId: string): Promise<void> {
  const user = await currentUser()
  if (!user) loginThenBack(slug)
  await removeComment(commentId, user.id)
  revalidatePath(`/character/${slug}`)
  revalidatePath(`/character/${slug}/comments`)
}

export async function bookmark(slug: string): Promise<void> {
  const user = await currentUser()
  if (!user) loginThenBack(slug)
  const id = await characterIdOf(slug)
  if (!id) return
  await toggleBookmark(id, user.id)
  revalidatePath(`/character/${slug}`)
}

export async function likeCharacter(key: string, liked: boolean) {
  const user = await currentUser()
  if (!user) loginThenBack(key)
  const { getCharacterByKey } = await import('@/lib/characters')
  const character = await getCharacterByKey(key, user.id)
  if (!character) throw new Error('캐릭터를 찾을 수 없습니다.')
  const { setCharacterLiked } = await import('@/lib/social')
  const state = await setCharacterLiked(character.id, user.id, liked)
  revalidatePath(`/character/${key}`)
  return state
}
