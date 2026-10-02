import { POLICY, mockProvidersAllowed } from '@miro/config'
import type { ProviderInfo } from '../types'
import { adultOn, type AdultVerificationProvider, type VerificationRequest, type VerificationResult } from './types'

/** 인증 Provider 미확정. 생년월일 기준 만 나이만 본다 — 실제 신원 확인이 아님을 명시한다. */
export class MockAdultVerificationProvider implements AdultVerificationProvider {
  readonly info: ProviderInfo = {
    mode: 'mock', name: 'mock-adult-verification',
    notice: '성인 인증 Provider 미구성 — 생년월일 입력만으로 판정합니다. 실제 신원 확인이 아닙니다.',
  }
  async verify(req: VerificationRequest): Promise<VerificationResult> {
    if (!mockProvidersAllowed()) return { verified: false, reason: '현재 성인 콘텐츠는 제공하지 않습니다.', lock: true }
    const adult = adultOn(req.birthDate ?? '', new Date(), POLICY.adultVerification.minimumAge)
    if (adult === null) return { verified: false, reason: '생년월일 형식이 올바르지 않습니다.', lock: true }
    return adult
      ? { verified: true }
      : { verified: false, reason: `만 ${POLICY.adultVerification.minimumAge}세가 되는 해의 1월 1일부터 이용할 수 있습니다.`, lock: true }
  }
}
