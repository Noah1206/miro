'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { destroySession, requireUser } from '@/lib/auth'
import { getPersona, savePersona } from '@/lib/persona'
import { uploadCharacterImage } from '@/lib/storage/images'

export type ProfileResult = { ok: true } | { ok: false; error: string } | null

/**
 * '나' 화면의 프로필 편집(2026-09-30 요청) — 닉네임과 프로필 사진.
 * 닉네임은 온보딩에서 받은 그 이름, 곧 내 페르소나 이름(캐릭터가 나를 부르는 이름)이다 — 성별·소개는 그대로 둔다.
 * 닉네임을 먼저 검사하고 저장한 뒤 사진을 올린다 — 이름이 막히면 사진을 올리지 않는다.
 */
export async function saveProfile(_: ProfileResult, form: FormData): Promise<ProfileResult> {
  const user = await requireUser()
  const existing = await getPersona(user.id)
  const nickname = String(form.get('nickname') ?? '').trim()
  if (nickname !== existing?.name) {
    const saved = await savePersona(user.id, { name: nickname, gender: existing?.gender ?? null, description: existing?.description ?? null })
    if (!saved.ok) return { ok: false, error: saved.error }
  }
  const avatar = form.get('avatar')
  if (avatar instanceof File && avatar.size > 0) {
    const uploaded = await uploadCharacterImage(avatar, user.id)
    if (!uploaded.ok) return { ok: false, error: uploaded.error }
    await db.update(users).set({ avatarUrl: uploaded.url }).where(eq(users.id, user.id))
  }
  revalidatePath('/my')
  return { ok: true }
}

/** 로그아웃 — 설정 페이지가 없어져 '나' 화면 아래 메뉴에서 부른다(2026-10-01). */
export async function logout(): Promise<void> {
  await destroySession()
  redirect('/login')
}
