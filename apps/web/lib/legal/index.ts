import { msg } from '@/lib/i18n'
import { AI_NOTICE } from './ai'
import { MARKETING_CONSENT, NIGHT_MARKETING_CONSENT } from './marketing'
import { PRIVACY_POLICY } from './privacy'
import { SERVICE_TERMS } from './service'

/** 약관/개인정보 버전(= 시행일). 동의 기록(terms_consents)에 함께 남긴다. 본문을 바꾸면 날짜를 올린다. */
export const TERMS_VERSION = '2026-10-01'
export const PRIVACY_VERSION = '2026-10-01'

/**
 * 문서 한 덩어리: 문단 / 강조 문단 / 목록 / 표. 본문은 한국어 원문이 기준이라 번역하지 않는다.
 * important — 청약철회 제한·환불·면책처럼 약관규제법 제3조가 '명확하게' 알리라고 하는 내용.
 */
export type LegalBlock = string | { important: string } | { list: string[]; ordered?: boolean } | { table: { head: string[]; rows: string[][] } }
export type LegalSection = { title: string; blocks: LegalBlock[] }
export type LegalDoc = { title: string; version: string; intro?: string; sections: LegalSection[] }

/** /terms/[doc] 의 문서들. 제목만 화면 언어로 번역한다. */
export const LEGAL_DOCS: Record<string, LegalDoc> = {
  service: { title: msg('서비스 이용약관'), version: TERMS_VERSION, ...SERVICE_TERMS },
  privacy: { title: msg('개인정보 처리방침'), version: PRIVACY_VERSION, ...PRIVACY_POLICY },
  ai: { title: msg('AI 생성 콘텐츠 안내'), version: TERMS_VERSION, ...AI_NOTICE },
  marketing: { title: msg('광고성 정보 수신 동의'), version: PRIVACY_VERSION, ...MARKETING_CONSENT },
  'night-marketing': { title: msg('야간 광고성 정보 수신 동의'), version: PRIVACY_VERSION, ...NIGHT_MARKETING_CONSENT },
}
