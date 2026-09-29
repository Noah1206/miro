import { cookies, headers } from 'next/headers'
import en from './messages/en.json'
import ja from './messages/ja.json'
import zh from './messages/zh.json'
import { LANGUAGE_COOKIE, pickLanguage, translate, type Language, type Messages, type T } from './index'

const MESSAGES: Record<Exclude<Language, 'ko'>, Messages> = { en, ja, zh }

/** 이번 요청의 화면 언어. */
export async function getLanguage(): Promise<Language> {
  const [jar, h] = await Promise.all([cookies(), headers()])
  return pickLanguage(jar.get(LANGUAGE_COOKIE)?.value, h.get('accept-language'))
}

export function messagesFor(language: Language): Messages | null {
  return language === 'ko' ? null : MESSAGES[language]
}

/** 서버 컴포넌트·서버 액션용 번역 함수. */
export async function getT(): Promise<T> {
  const messages = messagesFor(await getLanguage())
  return (text, params) => translate(messages, text, params)
}

/** 요청 밖(앱 밖 연락·푸시)에서 사용자가 고른 언어로 옮길 때. 언어는 user_settings.language 에서 읽어 넘긴다. */
export function translateTo(language: Language | null | undefined, text: string, params?: Parameters<T>[1]): string {
  return translate(messagesFor(language ?? 'ko'), text, params)
}
