import type { ProviderInfo } from '../types'

export type VerificationRequest = {
  userId: string
  /** Mock 은 생년월일만 본다. */
  birthDate?: string   // YYYY-MM-DD
  /** 본인인증(PortOne)은 브라우저가 끝낸 인증 건의 id 로 결과를 서버가 다시 받는다. */
  identityVerificationId?: string
}
/** lock: 24시간 재시도 잠금을 걸 실패인가. 창을 닫았거나 공급자 장애면 잠그지 않는다. */
/** di: 본인확인기관이 준 중복가입확인정보(사이트마다 다른 값) — 한 사람이 여러 계정으로 인증하는 걸 막는 데만 쓴다. 공급자가 안 주면 없다. */
export type VerificationResult = { verified: true; di?: string } | { verified: false; reason: string; lock: boolean }

export interface AdultVerificationProvider {
  readonly info: ProviderInfo
  /** 브라우저가 본인인증 창을 여는 데 쓰는 공개 값(PortOne). Mock 은 없다 — 생년월일 폼. */
  readonly client?: { storeId: string; channelKey: string }
  verify(req: VerificationRequest): Promise<VerificationResult>
}

/**
 * 청소년 보호법 기준 성인인가(10/2 사용자 결정) — 만 19세가 되는 해의 1월 1일부터 청소년이 아니다. 생일은 보지 않고 해만 한국 날짜로 센다.
 * 예: 2007년생은 2026-01-01 부터. 형식이 틀리면 null.
 */
export function adultOn(birthDate: string, now: Date, minimumAge: number): boolean | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate)
  if (!m) return null
  return Number(now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 4)) - Number(m[1]) >= minimumAge
}
