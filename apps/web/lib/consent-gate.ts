import { eq } from 'drizzle-orm'
import { db, termsConsents, users } from '@miro/db'

export type ConsentStep = '/onboarding' | '/onboarding/transfer' | '/onboarding/verify'

/**
 * 로그인한 회원이 아직 마치지 않은 가입 단계가 있으면 그 화면의 주소를 돌려준다 — 루트·로그인 콜백·온보딩·(main) 레이아웃이 같은 판단을 쓴다.
 * 온보딩(약관·처리방침) → 국외 이전 별도 동의(10/5) → 본인인증(11/8 성인 서비스 — 청소년 보호법상 연령 확인) 순서.
 */
export async function consentRedirect(userId: string): Promise<ConsentStep | null> {
  const [row] = await db.select({ transferVersion: termsConsents.transferVersion, consented: termsConsents.userId, verified: users.adultVerifiedAt })
    .from(users).leftJoin(termsConsents, eq(termsConsents.userId, users.id)).where(eq(users.id, userId)).limit(1)
  if (!row?.consented) return '/onboarding'
  if (!row.transferVersion) return '/onboarding/transfer'
  if (!row.verified) return '/onboarding/verify'
  return null
}
