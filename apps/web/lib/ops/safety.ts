import { productionRuntime } from '@miro/config'
import { and, desc, eq } from 'drizzle-orm'
import { db, characters, characterVisualIdentities, users } from '@miro/db'
import { adultCharacter, gateMature, mentionsMinor, type MatureGate } from '@miro/domain'
import { adultModelReady, resolveAdultVerification } from '@miro/providers'
import { msg } from '@/lib/i18n'
import { getPersona, getConversationPersona } from '@/lib/persona'

/** 서버 기준 성인 표현 허용 판정. 클라이언트 토글 값을 믿지 않는다. 11/8 베타 테스터 예외 삭제 — 누구나 본인인증으로 연다. */
export async function matureGateFor(userId: string, characterId: string): Promise<MatureGate> {
  const [u] = await db.select({ v: users.adultVerifiedAt, p: users.maturePolicyAgreedAt })
    .from(users).where(eq(users.id, userId)).limit(1)
  // 운영은 실제 본인인증(PortOne)이 붙어야 열린다 — Mock 인증은 신원 확인이 아니다.
  if (productionRuntime() && resolveAdultVerification().info.mode !== 'live') return { allowed: false, reason: 'not_verified', next: msg('현재 일반 등급 콘텐츠만 제공합니다.') }
  // 표만 읽는다(11/15) — activeVisualIdentity 는 외형이 비면 AI 추론까지 돌려서, 방을 열고 턴을 보낼 때마다 수십 초가 걸렸다. 외형은 사진을 그릴 때만 채운다.
  const [vi] = await db.select({ real: characterVisualIdentities.hasRealPersonReference }).from(characterVisualIdentities)
    .where(and(eq(characterVisualIdentities.characterId, characterId), eq(characterVisualIdentities.isActive, true)))
    .orderBy(desc(characterVisualIdentities.version)).limit(1)
  return gateMature({
    adultVerifiedAt: u?.v ?? null, maturePolicyAgreedAt: u?.p ?? null,
    hasRealPersonReference: vi?.real ?? false,
  })
}

/**
 * 이 대화방에서 성인 모드를 켤 수 있는가(10/2) — 성인 전용 모델이 있고, 성인 표현 판정(인증·정책 동의·실존 인물)을 통과하고,
 * 캐릭터가 만 19세 이상으로 적혀 있어야 한다. 켤 때와 매 턴 대사 지시를 고를 때 같은 판정을 쓴다.
 */
export async function adultModeGateFor(userId: string, characterId: string, sessionId?: string): Promise<MatureGate> {
  if (!adultModelReady()) return { allowed: false, reason: 'adult_model_unavailable', next: msg('현재 일반 등급 콘텐츠만 제공합니다.') }
  const gate = await matureGateFor(userId, characterId)
  if (!gate.allowed) return gate
  const [c] = await db.select({ age: characters.age, occupation: characters.occupation, socialPosition: characters.socialPosition, role: characters.role, tagline: characters.tagline })
    .from(characters).where(eq(characters.id, characterId)).limit(1)
  if (!c || !adultCharacter(c)) return { allowed: false, reason: 'character_not_adult', next: msg('만 19세 이상으로 설정된 캐릭터만 언베일을 켤 수 있어요.') }
  // 내 페르소나가 학생·미성년이면 켜지 않는다(10/3 — 언베일에서 미성년자는 아예 나오지 않게). 매 턴 재판정이라 켠 뒤에 바꿔도 일반 기준으로 돌아간다.
  const persona = sessionId ? await getConversationPersona(userId, sessionId) : await getPersona(userId)
  if (mentionsMinor(persona?.name) || mentionsMinor(persona?.description)) return { allowed: false, reason: 'persona_minor', next: msg('페르소나가 학생·미성년자로 되어 있으면 언베일을 켤 수 없어요.') }
  return gate
}
