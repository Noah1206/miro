'use server'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { currentUser, destroySession, requireUser } from '@/lib/auth'
import { track } from '@/lib/analytics/track'
import { getPersona, parsePersona, savePersona } from '@/lib/persona'
import { uploadCharacterImage } from '@/lib/storage/images'
import { accountProfile, type AccountProfile } from '@/lib/account-profile'
import { checkIn } from '@/lib/attendance'
import { redeemCoupon } from '@/lib/coupon'
import { applyReferral } from '@/lib/referral'

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
  const user = await currentUser()
  if (user) await track(user.id, 'logout')
  await destroySession()
  redirect('/home')
}

/** 11/10 출석 체크 — 프로필의 버튼. 하루 한 번 500, 7일 연속마다 500 추가(11/14 1,500→500). */
export async function attend() {
  const user = await requireUser()
  return checkIn(user.id)
}

/** 11/18 이벤트 쿠폰 — 프로필의 쿠폰 칸. 쿠폰이 아니면 친구의 추천인 코드로 본다. */
export async function claimCoupon(code: string) {
  const user = await requireUser()
  const r = await redeemCoupon(user.id, String(code ?? ''))
  if (r.ok || r.error !== 'unknown') return { ...r, kind: 'coupon' as const }
  const ref = await applyReferral(user.id, String(code ?? '').trim().toUpperCase().replace(/\s+/g, ''))
  if (!ref) return { ...r, kind: 'coupon' as const }
  return ref.ok ? { ok: true as const, units: ref.units, validDays: 7, kind: 'referral' as const } : { ok: false as const, error: ref.error, kind: 'referral' as const }
}
