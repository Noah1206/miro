'use server'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { destroySession, requireUser } from '@/lib/auth'
import { getPersona, parsePersona, savePersona } from '@/lib/persona'
import { uploadCharacterImage } from '@/lib/storage/images'
import { accountProfile, type AccountProfile } from '@/lib/account-profile'

export type ProfileResult = { ok: true; profile: AccountProfile } | { ok: false; error: string } | null

/**
 * '나' 화면의 프로필 편집(2026-09-30 요청) — 닉네임과 프로필 사진.
 * 닉네임은 온보딩에서 받은 그 이름, 곧 내 페르소나 이름(캐릭터가 나를 부르는 이름)이다 — 성별·소개는 그대로 둔다.
 * 닉네임 검사를 통과한 뒤 사진을 올린다. 업로드가 실패하면 이름도 저장하지 않는다.
 */
export async function saveProfile(_: ProfileResult, form: FormData): Promise<ProfileResult> {
  const user = await requireUser()
  const existing = await getPersona(user.id)
  const nickname = String(form.get('nickname') ?? '').trim()
  const fields = { name: nickname, gender: existing?.gender ?? null, description: existing?.description ?? null }
  if (nickname !== existing?.name) {
    const parsed = parsePersona(fields)
    if (!parsed.ok) return { ok: false, error: parsed.error }
  }
  const avatar = form.get('avatar')
  let avatarUrl: string | null = null
  if (avatar instanceof File && avatar.size > 0) {
    const uploaded = await uploadCharacterImage(avatar, user.id)
    if (!uploaded.ok) return { ok: false, error: uploaded.error }
    avatarUrl = uploaded.url
  }
  if (nickname !== existing?.name) {
    const saved = await savePersona(user.id, fields)
    if (!saved.ok) return { ok: false, error: saved.error }
  }
  if (avatarUrl) await db.update(users).set({ avatarUrl }).where(eq(users.id, user.id))
  // Refresh after the client receives success. Revalidating this open sheet's
  // route inside the action can leave its pending transition waiting on itself.
  return { ok: true, profile: await accountProfile(user) }
}

/** 로그아웃 — 설정 페이지가 없어져 '나' 화면 아래 메뉴에서 부른다(2026-10-01). */
export async function logout(): Promise<void> {
  await destroySession()
  redirect('/home')
}
