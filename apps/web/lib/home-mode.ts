import { and, eq, isNull } from 'drizzle-orm'
import { db, users, userSettings } from '@miro/db'
import { adultModelReady, resolveAdultVerification } from '@miro/providers'
import { productionRuntime } from '@miro/config'
import { mentionsMinor } from '@miro/domain'
import { getPersona } from './persona'
import { msg } from './i18n'

export async function homeUnveilEnabled(userId: string | null): Promise<boolean> {
  if (!userId) return false
  const [row] = await db.select({ enabled: userSettings.unveilEnabled, verified: users.adultVerifiedAt, agreed: users.maturePolicyAgreedAt }).from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id)).where(and(eq(users.id, userId), isNull(users.deletedAt)))
  return !!(row?.enabled && row.verified && row.agreed)
}

export async function setHomeUnveilFor(userId: string, enabled: boolean, agreed = false): Promise<{ ok: true; enabled: boolean } | { ok: false; reason: 'verification' | 'policy' | 'unavailable'; error: string }> {
  const [user] = await db.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)))
  if (!user || (enabled && !user.adultVerifiedAt)) return { ok: false, reason: 'verification', error: msg('언베일을 켜려면 최초 1회 성인 인증이 필요해요.') }
  if (enabled && !user.maturePolicyAgreedAt && !agreed) return { ok: false, reason: 'policy', error: msg('성인 콘텐츠 정책에 동의해 주세요.') }
  if (enabled) {
    if (!adultModelReady() || (productionRuntime() && resolveAdultVerification().info.mode !== 'live')) return { ok: false, reason: 'unavailable', error: msg('현재 일반 등급 콘텐츠만 제공합니다.') }
    const persona = await getPersona(userId)
    if (mentionsMinor(persona?.name) || mentionsMinor(persona?.description)) return { ok: false, reason: 'unavailable', error: msg('페르소나가 학생·미성년자로 되어 있으면 언베일을 켤 수 없어요.') }
  }
  return db.transaction(async tx => {
    const [current] = await tx.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt))).for('update')
    if (!current || (enabled && !current.adultVerifiedAt)) return { ok: false as const, reason: 'verification' as const, error: msg('언베일을 켜려면 최초 1회 성인 인증이 필요해요.') }
    if (enabled && !current.maturePolicyAgreedAt && !agreed) return { ok: false as const, reason: 'policy' as const, error: msg('성인 콘텐츠 정책에 동의해 주세요.') }
    if (enabled && agreed && !current.maturePolicyAgreedAt) await tx.update(users).set({ maturePolicyAgreedAt: new Date() }).where(eq(users.id, userId))
    await tx.insert(userSettings).values({ userId, unveilEnabled: enabled }).onConflictDoUpdate({ target: userSettings.userId, set: { unveilEnabled: enabled, updatedAt: new Date() } })
    return { ok: true as const, enabled }
  })
}

/**
 * 작품을 성인용 채팅으로 시작·진행할 수 있는가(10/19) — 켤 때와 같은 조건(성인 인증·정책 동의·전용 모델·운영 실인증·페르소나 미성년 아님)에
 * 작품 인물·주인공이 모두 만 19세 이상이고 주인공 입력에 학생·미성년 표현이 없어야 한다. home=true 면 홈 언베일도 켜져 있어야 한다(시작 버튼).
 * 진행 중엔 home=false 로 매 턴 다시 본다 — 성인용으로 시작한 회차는 홈 토글과 무관하게 성인용이지만 자격이 사라지면 일반 지시로 돌아간다.
 */
export async function storyUnveilAllowed(userId: string, story: { protagonist: { minAge: number }; characters: { age: number }[] },
  protagonist: { name: string; age: number; details: Record<string, string> } | null, opts: { home: boolean }): Promise<boolean> {
  if (!adultModelReady() || (productionRuntime() && resolveAdultVerification().info.mode !== 'live')) return false
  if (story.protagonist.minAge < 19 || story.characters.some(c => c.age < 19)) return false
  if (protagonist && (protagonist.age < 19 || mentionsMinor([protagonist.name, ...Object.values(protagonist.details)].join(' ')))) return false
  const [row] = await db.select({ enabled: userSettings.unveilEnabled, verified: users.adultVerifiedAt, agreed: users.maturePolicyAgreedAt }).from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id)).where(and(eq(users.id, userId), isNull(users.deletedAt)))
  if (!row?.verified || !row.agreed || (opts.home && !row.enabled)) return false
  const persona = await getPersona(userId)
  return !mentionsMinor(persona?.name) && !mentionsMinor(persona?.description)
}
