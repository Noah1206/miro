'use client'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { translate, type Language, type Messages, type T } from './index'

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

/** 제자리에서 언어 바꾸기 — 서버 액션 chooseLanguage 가 돌려준 사전을 넘긴다. */
export function useSwitchLanguage(): (next: State) => void {
  return useContext(Ctx).switchTo
}

/** 클라이언트 컴포넌트용 번역 함수. */
export function useT(): T {
  const { messages } = useContext(Ctx)
  return useCallback((text, params) => translate(messages, text, params), [messages])
}

export function useLanguage(): Language {
  return useContext(Ctx).language
}
