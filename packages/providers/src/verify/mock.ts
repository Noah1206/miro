import { POLICY, mockProvidersAllowed } from '@miro/config'
import type { ProviderInfo } from '../types'
import type { AdultVerificationProvider, VerificationRequest, VerificationResult } from './types'

/** 인증 Provider 미확정. 생년월일 기준 만 나이만 본다 — 실제 신원 확인이 아님을 명시한다. */
export class MockAdultVerificationProvider implements AdultVerificationProvider {
  readonly info: ProviderInfo = {
    mode: 'mock', name: 'mock-adult-verification',
    notice: '성인 인증 Provider 미구성 — 생년월일 입력만으로 판정합니다. 실제 신원 확인이 아닙니다.',
  }
  async verify(req: VerificationRequest): Promise<VerificationResult> {
    if (!mockProvidersAllowed()) return { verified: false, reason: '현재 성인 콘텐츠는 제공하지 않습니다.' }
    const birth = new Date(req.birthDate)
    if (Number.isNaN(birth.getTime())) return { verified: false, reason: '생년월일 형식이 올바르지 않습니다.' }
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
    return age >= POLICY.adultVerification.minimumAge
      ? { verified: true }
      : { verified: false, reason: `만 ${POLICY.adultVerification.minimumAge}세 이상만 이용할 수 있습니다.` }
  }
}
