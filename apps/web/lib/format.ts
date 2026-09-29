import { INTL_LOCALE, type Language } from '@/lib/i18n'

/**
 * 96.1만 처럼 짧게. 서버·클라이언트 양쪽에서 쓰므로 'use client' 파일에 두지 않는다
 * (클라이언트 모듈의 함수는 서버에서 호출할 수 없다).
 * language 를 주면(한국어 외) 그 언어의 짧은 표기(1.2K, 1.2万).
 */
export function compact(n: number, language?: Language): string {
  if (language && language !== 'ko') return new Intl.NumberFormat(INTL_LOCALE[language], { notation: 'compact', maximumFractionDigits: 1 }).format(n)
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}만`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}천`
  return String(n)
}

/**
 * 한글 조사. 받침 유무로 갈린다 — '담배을' 처럼 쓰지 않는다.
 * 한글이 아니면(영문·숫자) 조사를 붙이지 않는다("Thomas 입력 중"). 빠지면 뜻이 바뀌는 조사('와의' → '의')는 fallback 으로 대신 붙인다.
 */
export function withParticle(word: string, withFinal: string, withoutFinal: string, fallback = ''): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return `${word}${fallback}`
  return `${word}${(code - 0xac00) % 28 !== 0 ? withFinal : withoutFinal}`
}

/** 이름 뒤의 주격 조사 — '토마스가', '히사시가'. */
export const subject = (name: string) => withParticle(name, '이', '가')
