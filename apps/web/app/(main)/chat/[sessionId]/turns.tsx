'use client'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { Msg } from './messages'

/** 리롤(10/27): 마지막 답 아래 '다시 받기'가 입력창에 보내는 신호. detail = { replyId, input }. */
export const REROLL = 'miro:reroll'

/** 지금 오고 있는 답(10/9 스트리밍) — 보낸 말과, 저장 전에 받은 블록. 저장된 답이 오면 그것으로 바뀐다. */
export type LiveTurn = { input: string; blocks: Array<Record<string, unknown>>; playbackId?: string }
type Turns = {
  appended: Msg[]
  /** quiet: 이미 스트리밍으로 보여 준 답 — 다시 타이핑하지 않는다. */
  append: (items: Msg[], opts?: { quiet?: boolean; playbackId?: string }) => void
  quiet: ReadonlySet<string>
  playbackKeys: ReadonlyMap<string, string>
  live: LiveTurn | null
  setLive: (live: LiveTurn | null) => void
  calendarPending: boolean
  setCalendarPending: (pending: boolean) => void
  /** 리롤로 되돌린 메시지(10/27) — 서버 목록이 다시 오기 전까지 화면에서 뺀다. */
  removed: ReadonlySet<string>
  remove: (ids: string[]) => void
}
const Ctx = createContext<Turns>({ appended: [], append: () => {}, quiet: new Set(), playbackKeys: new Map(), live: null, setLive: () => {}, calendarPending: false, setCalendarPending: () => {}, removed: new Set(), remove: () => {} })

/**
 * 방금 보낸 턴의 메시지. 서버가 돌려준 것을 바로 그린다 — 답을 보려고 페이지 전체를 다시 받지 않는다.
 * 뒤이어 오는 백그라운드 refresh 가 같은 id 를 서버 목록에 실으면 목록 쪽이 이긴다.
 */
export function TurnsProvider({ children }: { children: ReactNode }) {
  const [appended, setAppended] = useState<Msg[]>([])
  const [quiet, setQuiet] = useState<ReadonlySet<string>>(new Set())
  const [playbackKeys, setPlaybackKeys] = useState<ReadonlyMap<string, string>>(new Map())
  const [live, setLive] = useState<LiveTurn | null>(null)
  const [calendarPending, setCalendarPending] = useState(false)
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const remove = useCallback((ids: string[]) => setRemoved(prev => new Set([...prev, ...ids])), [])
  const append = useCallback((items: Msg[], opts: { quiet?: boolean; playbackId?: string } = {}) => {
    if (opts.quiet) setQuiet(prev => new Set([...prev, ...items.map(m => m.id)]))
    if (opts.playbackId) setPlaybackKeys(prev => {
      const next = new Map(prev)
      for (const m of items) if (m.role === 'user' || m.role === 'character') next.set(m.id, `${opts.playbackId}:${m.role === 'user' ? 'user' : 'reply'}`)
      return next
    })
    setAppended(prev => {
      const known = new Set(prev.map(m => m.id))
      return [...prev, ...items.filter(m => !known.has(m.id))]
    })
  }, [])
  return <Ctx.Provider value={{ appended, append, quiet, playbackKeys, live, setLive, calendarPending, setCalendarPending, removed, remove }}>{children}</Ctx.Provider>
}
export const useTurns = () => useContext(Ctx)
