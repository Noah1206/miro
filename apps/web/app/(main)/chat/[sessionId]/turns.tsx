'use client'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { Msg } from './messages'

/** 지금 오고 있는 답(10/9 스트리밍) — 보낸 말과, 저장 전에 받은 블록. 저장된 답이 오면 그것으로 바뀐다. */
export type LiveTurn = { input: string; blocks: Array<Record<string, unknown>> }
type Turns = {
  appended: Msg[]
  /** quiet: 이미 스트리밍으로 보여 준 답 — 다시 타이핑하지 않는다. */
  append: (items: Msg[], opts?: { quiet?: boolean }) => void
  quiet: ReadonlySet<string>
  live: LiveTurn | null
  setLive: (live: LiveTurn | null) => void
}
const Ctx = createContext<Turns>({ appended: [], append: () => {}, quiet: new Set(), live: null, setLive: () => {} })

/**
 * 방금 보낸 턴의 메시지. 서버가 돌려준 것을 바로 그린다 — 답을 보려고 페이지 전체를 다시 받지 않는다.
 * 뒤이어 오는 백그라운드 refresh 가 같은 id 를 서버 목록에 실으면 목록 쪽이 이긴다.
 */
export function TurnsProvider({ children }: { children: ReactNode }) {
  const [appended, setAppended] = useState<Msg[]>([])
  const [quiet, setQuiet] = useState<ReadonlySet<string>>(new Set())
  const [live, setLive] = useState<LiveTurn | null>(null)
  const append = useCallback((items: Msg[], opts: { quiet?: boolean } = {}) => {
    if (opts.quiet) setQuiet(prev => new Set([...prev, ...items.map(m => m.id)]))
    setAppended(prev => {
      const known = new Set(prev.map(m => m.id))
      return [...prev, ...items.filter(m => !known.has(m.id))]
    })
  }, [])
  return <Ctx.Provider value={{ appended, append, quiet, live, setLive }}>{children}</Ctx.Provider>
}
export const useTurns = () => useContext(Ctx)
