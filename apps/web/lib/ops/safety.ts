import { productionRuntime } from '@miro/config'
import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { gateMature, type MatureGate } from '@miro/domain'
import { activeVisualIdentity } from '@/lib/simulation/media'

/** 서버 기준 성인 표현 허용 판정. 클라이언트 토글 값을 믿지 않는다. */
export async function matureGateFor(userId: string, characterId: string): Promise<MatureGate> {
  if (productionRuntime()) return { allowed: false, reason: 'not_verified', next: '현재 일반 등급 콘텐츠만 제공합니다.' }
  const [u] = await db.select({ v: users.adultVerifiedAt, p: users.maturePolicyAgreedAt })
    .from(users).where(eq(users.id, userId)).limit(1)
  const vi = await activeVisualIdentity(characterId)
  return gateMature({
    adultVerifiedAt: u?.v ?? null, maturePolicyAgreedAt: u?.p ?? null,
    hasRealPersonReference: vi.hasRealPersonReference,
  })
}
