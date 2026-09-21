'use client'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { Msg } from './messages'

type Turns = { appended: Msg[]; append: (items: Msg[]) => void }
const Ctx = createContext<Turns>({ appended: [], append: () => {} })

/**
 * 방금 보낸 턴의 메시지. 서버 액션이 돌려준 것을 바로 그린다 — 답을 보려고 페이지 전체를 다시 받지 않는다.
 * 뒤이어 오는 백그라운드 refresh 가 같은 id 를 서버 목록에 실으면 목록 쪽이 이긴다.
 */
export function TurnsProvider({ children }: { children: ReactNode }) {
  const [appended, setAppended] = useState<Msg[]>([])
  const append = useCallback((items: Msg[]) => setAppended(prev => {
    const known = new Set(prev.map(m => m.id))
    return [...prev, ...items.filter(m => !known.has(m.id))]
  }), [])
  return <Ctx.Provider value={{ appended, append }}>{children}</Ctx.Provider>
}
export const useTurns = () => useContext(Ctx)
