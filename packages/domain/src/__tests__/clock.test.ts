import { describe, expect, it } from 'vitest'
import { localClock, minutesOf, periodOf } from '../time/clock'

describe('local clock', () => {
  it('renders the user-local date, weekday and period', () => {
    const c = localClock(new Date('2026-09-26T05:32:00Z'), 'Asia/Seoul')   // 14:32 KST, 토요일
    expect(c.label).toBe('2026-09-26 (토) 14:32')
    expect(c.weekday).toBe(6)
    expect(c.hour).toBe(14)
    expect(c.period).toBe('낮')
    expect(localClock(new Date('2026-09-26T14:10:00Z'), 'Asia/Seoul').period).toBe('밤')   // 23:10 KST
  })
  it('names the periods of a day', () => {
    expect([3, 8, 12, 18, 22].map(periodOf)).toEqual(['새벽', '아침', '낮', '저녁', '밤'])
  })
  it('parses HH:MM and rejects nonsense', () => {
    expect(minutesOf('08:30')).toBe(510)
    expect(minutesOf('24:00')).toBeNull()
    expect(minutesOf('abc')).toBeNull()
  })
})
