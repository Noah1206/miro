import { revisionEffective } from '@/lib/legal/revisions'

/**
 * 11/12 청소년(만 14세 이상) 가입 개방 — 약관 제4조 ② 개정 시행일(2026-11-20)부터.
 * 그 전에는 시행 중인 약관대로 만 19세(청소년 보호법 기준) 이상 가입 + 가입 때 본인인증.
 */
export const teenOpen = (now = new Date()) => revisionEffective('service', '2026-11-20', now)

/**
 * 11/20 사용자: 만 14세 미만도 법정대리인(보호자) 동의를 받아 가입 — 처리방침 개정(2026-12-20, 법정대리인 확인 정보가 새로 생겨 30일 전 공지) 시행일부터.
 * 가입 때 '만 14세 미만'을 고르면 보호자가 휴대전화 본인인증을 마쳐야 서비스를 쓴다(lib/guardian.ts, consent-gate).
 */
export const childOpen = (now = new Date()) => revisionEffective('privacy', '2026-12-20', now)
