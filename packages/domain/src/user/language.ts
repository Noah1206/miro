/**
 * 사용자가 고른 언어(2026-09-30 결정: 한국어·영어·일본어·중국어). 앱 화면과 캐릭터의 말이 모두 이 언어를 따른다.
 * 이름은 그 언어로 적는다 — 고르는 화면에서 자기 언어를 알아볼 수 있게.
 */
export const LANGUAGES = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文' } as const
export type Language = keyof typeof LANGUAGES
export const DEFAULT_LANGUAGE: Language = 'ko'

export function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && Object.hasOwn(LANGUAGES, v)
}

/** 모델 규칙 한 줄. 한국어는 프롬프트의 기본이라 줄이 없다. */
const RULE_NAME: Record<Exclude<Language, 'ko'>, string> = { en: '영어(English)', ja: '일본어(日本語)', zh: '중국어 간체(简体中文)' }
export function languageRule(language: Language | null | undefined): string | null {
  if (!language || language === 'ko') return null
  return `- 사용자에게 보이는 모든 글(서술·속마음·대사·문자)은 ${RULE_NAME[language]}로 씁니다. 캐릭터 설정과 지난 대화가 한국어여도 이 언어로 자연스럽게 말합니다. 사람·장소 이름은 그대로 둡니다.`
}
