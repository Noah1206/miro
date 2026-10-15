'use client'
import { useCallback, useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import type { Msg } from './messages'

/** Only an unplayed room's authored opening is revealed. A finished opening stays read on this device. */
export function useOpeningPlayback(sessionId: string | undefined, items: Msg[], hasStarted: boolean) {
  const reduce = useReducedMotion()
  const opening = items.filter(m => m.opening)
  const count = opening.length
  const eligible = !!sessionId && !hasStarted && !items.some(m => m.role === 'user') && count > 0
  const key = `miro:opening-read:${sessionId}`
  const [progress, setProgress] = useState<{ key: string; cursor: number } | null>(null)

  useEffect(() => {
    if (!eligible) return
    let read = false
    try { read = localStorage.getItem(key) === '1' } catch { /* Playback still works without storage. */ }
    setProgress({ key, cursor: read || reduce ? count : 0 })
  }, [key, eligible, count, reduce])

  const ready = progress?.key === key
  const cursor = ready ? progress.cursor : 0
  const playing = eligible && !reduce && (!ready || cursor < count)
  const finish = useCallback(() => {
    setProgress({ key, cursor: count })
    try { localStorage.setItem(key, '1') } catch { /* The current visit still completes. */ }
  }, [key, count])
  useEffect(() => {
    if (eligible && ready && (reduce || cursor >= count)) {
      try { localStorage.setItem(key, '1') } catch { /* Optional device preference. */ }
    }
  }, [eligible, ready, reduce, cursor, count, key])

  const advance = useCallback((id: string) => {
    setProgress(previous => {
      if (previous?.key !== key || opening[previous.cursor]?.id !== id) return previous
      return { key, cursor: previous.cursor + 1 }
    })
  }, [key, opening])
  return {
    playing,
    activeId: playing && ready ? opening[cursor]?.id : undefined,
    visible: (m: Msg) => !playing || !m.opening || (ready && opening.findIndex(line => line.id === m.id) <= cursor),
    advance,
    finish,
  }
}
