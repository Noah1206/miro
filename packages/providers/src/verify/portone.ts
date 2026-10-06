import { POLICY } from '@miro/config'
import type { ProviderInfo } from '../types'
import { adultOn, type AdultVerificationProvider, type VerificationRequest, type VerificationResult } from './types'

/** 인증을 마친 뒤 이 시간 안에 확인한 건만 받는다. */
const FRESH_MS = 30 * 60_000
const UNCONFIRMED = '본인인증 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'

/**
 * PortOne V2 본인인증(10/2). 브라우저가 PortOne 창에서 인증을 끝내면, 서버가 그 건을 PortOne 에서 다시 받아 생년월일로 만 나이를 본다
 * — 브라우저가 보낸 결과는 믿지 않는다. 남기는 것은 성인 여부·시각과 DI 의 해시뿐(이름·전화·생년월일·CI 는 저장하지 않음, DI 는 10/6).
 * 본인확인기관(다날·KG이니시스·KCP)은 PortOne 콘솔의 채널로 고르고 채널 키만 넣는다.
 */
export class PortOneAdultVerificationProvider implements AdultVerificationProvider {
  readonly info: ProviderInfo = { mode: 'live', name: 'portone-identity-verification', notice: null }
  readonly client: { storeId: string; channelKey: string }
  constructor(private readonly apiSecret: string, storeId: string, channelKey: string) {
    this.client = { storeId, channelKey }
  }

  async verify(req: VerificationRequest): Promise<VerificationResult> {
    if (!req.identityVerificationId) return { verified: false, reason: '본인인증을 마치지 않았어요.', lock: false }
    let body: { status?: string; verifiedAt?: string; verifiedCustomer?: { birthDate?: string; di?: string } }
    try {
      const res = await fetch(`https://api.portone.io/identity-verifications/${encodeURIComponent(req.identityVerificationId)}`, {
        headers: { Authorization: `PortOne ${this.apiSecret}` }, signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return { verified: false, reason: UNCONFIRMED, lock: false }
      body = await res.json() as typeof body
    } catch { return { verified: false, reason: UNCONFIRMED, lock: false } }
    if (body.status !== 'VERIFIED') return { verified: false, reason: '본인인증을 마치지 않았어요.', lock: false }
    // 오래된 인증 건은 다시 쓰지 못한다(KCP 자체점검 4번 '데이터 재사용', 10/6) — 방금 끝낸 인증만 받는다.
    const at = Date.parse(body.verifiedAt ?? '')
    if (!(Date.now() - at < FRESH_MS)) return { verified: false, reason: '본인인증이 만료됐어요. 다시 인증해 주세요.', lock: false }
    const adult = adultOn(body.verifiedCustomer?.birthDate ?? '', new Date(), POLICY.adultVerification.minimumAge)
    if (adult === null) return { verified: false, reason: UNCONFIRMED, lock: false }
    return adult ? { verified: true, ...(body.verifiedCustomer?.di ? { di: body.verifiedCustomer.di } : {}) } : { verified: false, reason: `만 ${POLICY.adultVerification.minimumAge}세가 되는 해의 1월 1일부터 이용할 수 있습니다.`, lock: true }
  }
}
