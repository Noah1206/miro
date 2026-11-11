import { revisionEffective } from '@/lib/legal/revisions'

/**
 * 11/12 청소년(만 14세 이상) 가입 개방 — 약관 제4조 ② 개정 시행일(2026-11-20)부터.
 * 그 전에는 시행 중인 약관대로 만 19세(청소년 보호법 기준) 이상 가입 + 가입 때 본인인증.
 */
export const teenOpen = (now = new Date()) => revisionEffective('service', '2026-11-20', now)
