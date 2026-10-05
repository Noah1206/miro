import { msg } from '@/lib/i18n'
import { ADULT_POLICY } from './adult'
import { AI_NOTICE } from './ai'
import { MARKETING_CONSENT, NIGHT_MARKETING_CONSENT } from './marketing'
import { PRIVACY_POLICY } from './privacy'
import { REFUND_POLICY } from './refund'
import { effectiveVersion } from './revisions'
import { serviceTerms } from './service'
import { TRANSFER_CONSENT } from './transfer'

/**
 * 약관/개인정보 기준 버전(= 시행일). 개정은 revisions.ts 에 적고, 시행일이 지나면 termsVersion()/privacyVersion() 이 그 날짜를 돌려준다.
 * 동의 기록(terms_consents)에는 동의한 시점의 시행 버전을 남긴다.
 */
export const BASE_TERMS_VERSION = '2026-10-03'
export const BASE_PRIVACY_VERSION = '2026-10-03'
export const termsVersion = (now = new Date()) => effectiveVersion('service', BASE_TERMS_VERSION, now)
export const privacyVersion = (now = new Date()) => effectiveVersion('privacy', BASE_PRIVACY_VERSION, now)

/**
 * 문서 한 덩어리: 문단 / 강조 문단 / 목록 / 표. 본문은 한국어 원문이 기준이라 번역하지 않는다.
 * important — 청약철회 제한·환불·면책처럼 약관규제법 제3조가 '명확하게' 알리라고 하는 내용.
 */
export type LegalBlock = string | { important: string } | { list: string[]; ordered?: boolean } | { table: { head: string[]; rows: string[][] } }
export type LegalSection = { title: string; blocks: LegalBlock[] }
export type LegalDoc = { title: string; version: string; intro?: string; sections: LegalSection[] }

/** 문서 키 → 제목(화면 언어로 번역). 바닥글·온보딩·개정 안내가 같은 제목을 쓴다. */
export const LEGAL_TITLES = {
  service: msg('서비스 이용약관'),
  privacy: msg('개인정보 처리방침'),
  refund: msg('취소·환불 규정'),
  transfer: msg('개인정보 국외 이전 동의'),
  ai: msg('AI 생성 콘텐츠 안내'),
  adult: msg('언베일(성인 콘텐츠) 이용 정책'),
  marketing: msg('광고성 정보 수신 동의'),
  'night-marketing': msg('야간 광고성 정보 수신 동의'),
} as const
export type LegalKey = keyof typeof LEGAL_TITLES

/** /terms/[doc] 의 문서들 — 요청 시점(now)의 시행 버전으로 만든다. 제목만 화면 언어로 번역한다. */
export function legalDocs(now = new Date()): Record<LegalKey, LegalDoc> {
  const terms = termsVersion(now), privacy = privacyVersion(now)
  return {
    service: { title: LEGAL_TITLES.service, version: terms, ...serviceTerms(now) },
    privacy: { title: LEGAL_TITLES.privacy, version: privacy, ...PRIVACY_POLICY },
    refund: { title: LEGAL_TITLES.refund, version: terms, ...REFUND_POLICY },
    transfer: { title: LEGAL_TITLES.transfer, version: privacy, ...TRANSFER_CONSENT },
    ai: { title: LEGAL_TITLES.ai, version: terms, ...AI_NOTICE },
    adult: { title: LEGAL_TITLES.adult, version: terms, ...ADULT_POLICY },
    marketing: { title: LEGAL_TITLES.marketing, version: privacy, ...MARKETING_CONSENT },
    'night-marketing': { title: LEGAL_TITLES['night-marketing'], version: privacy, ...NIGHT_MARKETING_CONSENT },
  }
}
export const isLegalKey = (k: string): k is LegalKey => k in LEGAL_TITLES
