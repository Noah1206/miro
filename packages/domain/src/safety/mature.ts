import { POLICY } from '@miro/config'

export type MatureGateInput = {
  adultVerifiedAt: Date | null
  maturePolicyAgreedAt: Date | null
  /** Visual Identity 가 실존 인물을 참조하는가. */
  hasRealPersonReference: boolean
}

export type MatureGate =
  | { allowed: true }
  | { allowed: false; reason: 'not_verified' | 'policy_not_agreed' | 'real_person_reference' | 'character_not_adult' | 'adult_model_unavailable'; next: string }

/**
 * 성인 비주얼 허용 판정 (명세서 정책 2).
 * 인증 + 정책 동의가 모두 필요하고, 실존 인물 참조 비주얼은 인증과 무관하게 막는다.
 * 차단 시 사유와 다음 행동을 함께 돌려준다.
 */
export function gateMature(i: MatureGateInput): MatureGate {
  if (i.hasRealPersonReference) {
    return { allowed: false, reason: 'real_person_reference', next: '실존 인물을 참조한 외형에는 성인 표현을 적용할 수 없습니다. 텍스트 기반 외형으로 바꿔 주세요.' }
  }
  if (!i.adultVerifiedAt) {
    return { allowed: false, reason: 'not_verified', next: 'My > 성인 인증에서 인증을 완료해 주세요.' }
  }
  if (!i.maturePolicyAgreedAt) {
    return { allowed: false, reason: 'policy_not_agreed', next: '성인 콘텐츠 사용 정책에 동의해 주세요.' }
  }
  return { allowed: true }
}

/** 지금의 신분이 미성년자인 말 — 과거 이야기(학창 시절)는 보지 않으려고 나이·직업·위치·역할·한 줄 소개만 읽는다. */
const MINOR = /미성년|초등학|중학생|고등학생|고교생|초딩|중딩|고딩|청소년|어린이|아동|유아|로리|쇼타|\b(minor|underage|loli|shota|teen(ager)?s?|school ?(girl|boy)s?)\b/i

/**
 * 성인 모드를 켤 수 있는 캐릭터(10/2) — 나이 칸의 첫 숫자가 만 19세 이상이고, 지금의 신분에 미성년자를 가리키는 말이 없다.
 * 나이가 비었거나 숫자가 없으면 막는다(모르면 막음).
 */
export function adultCharacter(c: { age: string | null; occupation?: string | null; socialPosition?: string | null; role?: string | null; tagline?: string | null }): boolean {
  const age = Number(c.age?.match(/\d+/)?.[0] ?? NaN)
  return age >= POLICY.adultVerification.minimumAge && !MINOR.test([c.age, c.occupation, c.socialPosition, c.role, c.tagline].join(' '))
}

/** 인증 실패 후 재시도 가능 시각. 명세서 7.1: 24시간 뒤. */
export function verifyRetryAt(failedAt: Date | null): Date | null {
  if (!failedAt) return null
  return new Date(failedAt.getTime() + POLICY.adultVerification.retryAfterHours * 3600_000)
}

export function canRetryVerification(failedAt: Date | null, now: Date): boolean {
  const at = verifyRetryAt(failedAt)
  return at === null || now >= at
}

/** 삭제 확정된 역할극의 영구 삭제 기준 시각. 그 전까지는 복구 가능하다. */
export function purgeBefore(now: Date): Date {
  return new Date(now.getTime() - POLICY.retention.deletedSessionDays * 86_400_000)
}
