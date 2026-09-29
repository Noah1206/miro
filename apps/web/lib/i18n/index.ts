import { DEFAULT_LANGUAGE, isLanguage, LANGUAGES, type Language } from '@miro/domain'

/**
 * 앱 화면 번역(2026-09-30 결정: 한국어·영어·일본어·중국어). 한국어 원문이 곧 키다 — `t('다음')`.
 * 사전(messages/*.json)에 없으면 원문을 그대로 보인다. 값이 들어가는 자리는 `{name}` 으로 두고 params 로 채운다.
 * 서버가 돌려준 한국어 오류 문구도 화면에서 t() 로 감싸면 같은 사전으로 번역된다.
 */
export { LANGUAGES, type Language }
export const LANGUAGE_COOKIE = 'miro_lang'
export type Messages = Record<string, string>
export type TParams = Record<string, string | number>
export type T = (text: string, params?: TParams) => string

export function translate(messages: Messages | null, text: string, params?: TParams): string {
  const s = messages?.[text] || text
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s
}

/** 쿠키가 먼저, 없으면 브라우저 언어(Accept-Language) 가운데 앱이 아는 첫 언어, 그것도 없으면 한국어. */
export function pickLanguage(cookie: string | undefined, acceptLanguage: string | null): Language {
  if (isLanguage(cookie)) return cookie
  for (const part of (acceptLanguage ?? '').split(',')) {
    const code = part.trim().slice(0, 2).toLowerCase()
    if (isLanguage(code)) return code
  }
  return DEFAULT_LANGUAGE
}

/** 날짜·숫자 표시에 쓰는 로캘. */
export const INTL_LOCALE: Record<Language, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }

/**
 * 서버가 만들어 화면으로 돌려보내는 문구(오류 등)에 붙이는 표시. 값은 그대로 원문이다 — 화면이 t() 로 번역하고,
 * 사전을 만드는 스크립트가 t()·msg() 안의 원문을 모은다.
 */
export const msg = (text: string): string => text
