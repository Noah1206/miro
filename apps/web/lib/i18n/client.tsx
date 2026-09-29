'use client'
import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { translate, type Language, type Messages, type T } from './index'

const Ctx = createContext<{ language: Language; messages: Messages | null }>({ language: 'ko', messages: null })

/** 루트 레이아웃에 하나. 이번 요청의 언어와 그 언어의 사전만 내려보낸다(다른 언어 사전은 번들에 싣지 않는다). */
export function LanguageProvider({ language, messages, children }: { language: Language; messages: Messages | null; children: ReactNode }) {
  return <Ctx.Provider value={{ language, messages }}>{children}</Ctx.Provider>
}

/** 클라이언트 컴포넌트용 번역 함수. */
export function useT(): T {
  const { messages } = useContext(Ctx)
  return useCallback((text, params) => translate(messages, text, params), [messages])
}

export function useLanguage(): Language {
  return useContext(Ctx).language
}
