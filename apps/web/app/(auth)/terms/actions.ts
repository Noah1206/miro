'use server'

import { redirect } from 'next/navigation'
import { db, termsConsents, userSettings } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { takeNext } from '@/lib/oauth-state'
import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal'

/** n10 — 약관 동의 완료. 동의 시 기본 설정(야간 연락 차단 포함)도 함께 생성한다. */
export async function agreeToTerms(): Promise<void> {
  const user = await requireUser()

  await db.insert(termsConsents).values({
    userId: user.id,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  })

  // 명세서 5.1: 야간 선연락은 기본 차단. 스키마 기본값이 이를 보장한다.
  await db.insert(userSettings).values({ userId: user.id }).onConflictDoNothing()

  // 별도의 '어디서 시작할까요' 화면은 두지 않는다 (E-45) — 홈이 곧 그 선택지다.
  // 로그인 전에 보던 캐릭터가 있으면 그리로 이어준다.
  redirect((await takeNext()) ?? '/home')
}
