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
