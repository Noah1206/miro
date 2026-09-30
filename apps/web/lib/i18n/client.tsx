'use client'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { LANGUAGE_COOKIE, translate, type Language, type Messages, type T } from './index'

type State = { language: Language; messages: Messages | null }
const Ctx = createContext<State & { switchTo: (next: State) => void }>({ language: 'ko', messages: null, switchTo: () => {} })

/**
 * 루트 레이아웃에 하나. 이번 요청의 언어와 그 언어의 사전만 내려보낸다(다른 언어 사전은 번들에 싣지 않는다).
 * 화면 안에서 언어를 바꾸면(useSwitchLanguage) 서버에서 다시 받지 않고 여기서 사전을 갈아 끼운다.
 */
export function LanguageProvider({ language, messages, children }: State & { children: ReactNode }) {
  const [state, setState] = useState<State>({ language, messages })
  // 서버가 다른 언어로 다시 그렸으면(설정 화면·로그인) 그 값을 따른다.
  useEffect(() => { setState({ language, messages }) }, [language, messages])
  const switchTo = useCallback((next: State) => {
    setState(next)
    document.documentElement.lang = next.language === 'zh' ? 'zh-CN' : next.language
  }, [])
  return <Ctx.Provider value={{ ...state, switchTo }}>{children}</Ctx.Provider>
}

/** 다른 언어 사전은 필요할 때 따로 받는다(각 언어가 별도 파일로 나뉜다). 한 번 받으면 브라우저가 기억한다. */
const LOADERS: Record<Exclude<Language, 'ko'>, () => Promise<{ default: Messages }>> = {
  en: () => import('./messages/en.json'),
  ja: () => import('./messages/ja.json'),
  zh: () => import('./messages/zh.json'),
}
export function loadMessages(language: Language): Promise<Messages | null> {
  return language === 'ko' ? Promise.resolve(null) : LOADERS[language]().then((m) => m.default)
}

/**
 * 서버를 거치지 않고 제자리에서 언어 바꾸기(온보딩). 사전을 받아 갈아 끼우고 쿠키만 남긴다 — 서버 액션으로 쿠키를 쓰면
 * Next 가 화면 전체를 서버에서 다시 그려 한 번 누를 때마다 느렸다(9/30). 계정 설정에는 온보딩을 마칠 때 저장된다.
 */
export function useSwitchLanguage(): (language: Language) => Promise<void> {
  const { switchTo } = useContext(Ctx)
  return useCallback(async (language) => {
    const messages = await loadMessages(language)
    switchTo({ language, messages })
    document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`
  }, [switchTo])
}

/** 클라이언트 컴포넌트용 번역 함수. */
export function useT(): T {
  const { messages } = useContext(Ctx)
  return useCallback((text, params) => translate(messages, text, params), [messages])
}

export function useLanguage(): Language {
  return useContext(Ctx).language
}
