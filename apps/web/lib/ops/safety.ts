import { productionRuntime } from '@miro/config'
import { eq } from 'drizzle-orm'
import { db, characters, users } from '@miro/db'
import { adultCharacter, gateMature, type MatureGate } from '@miro/domain'
import { adultModelReady, resolveAdultVerification } from '@miro/providers'
import { activeVisualIdentity } from '@/lib/simulation/media'
import { msg } from '@/lib/i18n'

/**
 * 베타 성인 테스터(10/2 사용자 결정: "베타테스터는 내가 직접 뽑을 거라서") — MIRO_ADULT_TESTERS 의 이메일(쉼표 구분) 계정은
 * PortOne 본인인증 전이라도 성인 인증을 마친 것으로 본다. 테스터가 성인인지는 운영자가 직접 확인한다.
 */
export function adultTester(email: string | null | undefined): boolean {
  const list = (process.env.MIRO_ADULT_TESTERS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return !!email && list.includes(email.toLowerCase())
}

/** 서버 기준 성인 표현 허용 판정. 클라이언트 토글 값을 믿지 않는다. */
export async function matureGateFor(userId: string, characterId: string): Promise<MatureGate> {
  const [u] = await db.select({ v: users.adultVerifiedAt, p: users.maturePolicyAgreedAt, email: users.email })
    .from(users).where(eq(users.id, userId)).limit(1)
  const tester = adultTester(u?.email)
  // 운영은 실제 본인인증(PortOne)이 붙어야 열린다 — Mock 인증은 신원 확인이 아니다. 운영자가 고른 테스터만 예외.
  if (productionRuntime() && !tester && resolveAdultVerification().info.mode !== 'live') return { allowed: false, reason: 'not_verified', next: msg('현재 일반 등급 콘텐츠만 제공합니다.') }
  const vi = await activeVisualIdentity(characterId)
  // 테스터의 정책 동의는 방마다 첫 켜기 시트의 체크로 받는다.
  const since = tester ? new Date() : null
  return gateMature({
    adultVerifiedAt: u?.v ?? since, maturePolicyAgreedAt: u?.p ?? since,
    hasRealPersonReference: vi.hasRealPersonReference,
  })
}

/**
 * 이 대화방에서 성인 모드를 켤 수 있는가(10/2) — 성인 전용 모델이 있고, 성인 표현 판정(인증·정책 동의·실존 인물)을 통과하고,
 * 캐릭터가 만 19세 이상으로 적혀 있어야 한다. 켤 때와 매 턴 대사 지시를 고를 때 같은 판정을 쓴다.
 */
export async function adultModeGateFor(userId: string, characterId: string): Promise<MatureGate> {
  if (!adultModelReady()) return { allowed: false, reason: 'adult_model_unavailable', next: msg('현재 일반 등급 콘텐츠만 제공합니다.') }
  const gate = await matureGateFor(userId, characterId)
  if (!gate.allowed) return gate
  const [c] = await db.select({ age: characters.age, occupation: characters.occupation, socialPosition: characters.socialPosition, role: characters.role, tagline: characters.tagline })
    .from(characters).where(eq(characters.id, characterId)).limit(1)
  return c && adultCharacter(c) ? gate : { allowed: false, reason: 'character_not_adult', next: msg('만 19세 이상으로 설정된 캐릭터만 성인 모드를 켤 수 있어요.') }
}
