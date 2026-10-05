import { eq } from 'drizzle-orm'
import { db, termsConsents } from '@miro/db'

/**
 * 로그인한 회원이 아직 받지 않은 동의가 있으면 그 화면의 주소를 돌려준다 — 루트·로그인 콜백·온보딩이 같은 판단을 쓴다.
 * 온보딩(약관·처리방침) → 국외 이전 별도 동의(10/5, 기존 회원도 한 번 받는다) 순서.
 */
export async function consentRedirect(userId: string): Promise<'/onboarding' | '/onboarding/transfer' | null> {
  const [c] = await db.select({ transferVersion: termsConsents.transferVersion }).from(termsConsents).where(eq(termsConsents.userId, userId)).limit(1)
  if (!c) return '/onboarding'
  if (!c.transferVersion) return '/onboarding/transfer'
  return null
}
