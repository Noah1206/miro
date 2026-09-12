import type { ProviderInfo } from '../types'

export type VerificationRequest = {
  userId: string
  /** 실제 Provider 는 자체 폼/리다이렉트를 쓴다. Mock 은 생년월일만 본다. */
  birthDate: string   // YYYY-MM-DD
}
export type VerificationResult = { verified: true } | { verified: false; reason: string }

export interface AdultVerificationProvider {
  readonly info: ProviderInfo
  verify(req: VerificationRequest): Promise<VerificationResult>
}
