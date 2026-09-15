import { describe, expect, it } from 'vitest'
import { decide, openWindow, windowEnd, isWindowActive, costOf } from '../usage/window'
import type { UsageWindow } from '../usage/types'

const T0 = new Date('2026-09-12T13:20:00Z')

function win(over: Partial<UsageWindow> = {}): UsageWindow {
  return { id: 'w1', ...openWindow('u1', 'free', T0), ...over }
}

describe('usage window', () => {
  it('window ends at the next KST calendar month', () => {
    expect(windowEnd(T0).toISOString()).toBe('2026-09-30T15:00:00.000Z')
  })

  it('does NOT restart from the moment usage is exhausted', () => {
    const w = win({ consumed: 100, limit: 100 })
    const exhaustedAt = new Date('2026-09-12T14:00:00Z')
    // 소진 시점이 아니라 원래 창 종료 시각이 리셋 기준이다
    const d = decide(w, 'textRP', 1, exhaustedAt)
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.resetsAt.toISOString()).toBe('2026-09-30T15:00:00.000Z')
  })

  it('rejects once the limit would be exceeded', () => {
    const w = win({ consumed: 95, limit: 100 })
    expect(decide(w, 'photo', 1, T0).allowed).toBe(false) // photo=10 > 5 remaining
    expect(decide(w, 'textRP', 1, T0).allowed).toBe(true)
  })

  it('pro gets a higher limit than free for the same feature set', () => {
    expect(openWindow('u1', 'pro', T0).limit).toBeGreaterThan(openWindow('u1', 'free', T0).limit)
  })

  it('window expires at month boundary', () => {
    const w = win()
    expect(isWindowActive(w, new Date('2026-09-30T14:59:59Z'))).toBe(true)
    expect(isWindowActive(w, new Date('2026-09-30T15:00:00Z'))).toBe(false)
  })

  it('calls are charged per minute', () => {
    expect(costOf('videoCallPerMinute', 3)).toBe(costOf('videoCallPerMinute', 1) * 3)
  })
})
