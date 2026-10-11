import { describe, expect, it } from 'vitest'
import { agencyClock, contactBoundaryActive, shiftStoryDate, storyCalendarDirective, storyDaysBetween, validStoryDate } from '../index'

describe('the story calendar is independent of real time', () => {
  it('accepts historical dates and leap days but rejects rolled, incomplete or invalid dates', () => {
    for (const date of ['0001-01-01', '0099-12-31', '1850-06-18', '2000-02-29', '2024-02-29', '9999-12-31']) expect(validStoryDate(date)).toBe(true)
    for (const date of ['0000-01-01', '1900-02-29', '2026-02-30', '2026-13-01', '2026-1-01', 'today', null, 2026]) expect(validStoryDate(date)).toBe(false)
  })
  it('calculates calendar gaps and shortcuts independently of DST and runtime timezone', () => {
    expect(storyDaysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(storyDaysBetween('2024-03-01', '2024-02-28')).toBe(-2)
    expect(shiftStoryDate('2024-02-28', 1)).toBe('2024-02-29')
    expect(shiftStoryDate('2026-12-31', 7)).toBe('2027-01-07')
    expect(() => shiftStoryDate('9999-12-31', 1)).toThrow()
  })
  it('acknowledges a fresh forward change once without inventing shared experiences or romance', () => {
    const calendar = { version: 1 as const, date: '2026-10-18', previousDate: '2026-10-11', changedAtTurn: 3 }
    expect(storyCalendarDirective(calendar, 3)).toContain('moved forward 7 calendar day(s)')
    expect(storyCalendarDirective(calendar, 3)).toContain('does not prove new shared experiences')
    expect(storyCalendarDirective(calendar, 4)).not.toContain('moved forward')
    expect(storyCalendarDirective({ ...calendar, date: '2026-10-10' }, 3)).toContain('earlier date')
    expect(storyCalendarDirective({ ...calendar, date: 'invalid' }, 3)).toBe('')
  })
  it('uses story dates for user scene decisions while real background clocks and pauses stay unchanged', () => {
    const now = new Date('2026-10-11T12:00:00Z')
    const scene = agencyClock(now, 'Asia/Seoul', 'user', '1850-06-18')
    expect(scene).toMatchObject({ mode: 'narrative', narrativeNow: '1850-06-18T00:00:00.000Z', now: now.toISOString() })
    expect(agencyClock(now, 'Asia/Seoul', 'background', '2099-01-01')).toMatchObject({ mode: 'real_time', now: now.toISOString(), allowOfflineAdvance: false })
    expect(agencyClock(now, 'Asia/Seoul', 'user', 'invalid').mode).toBe('real_time')
    expect(contactBoundaryActive({ version: 1, mode: 'paused', until: '2026-10-11T15:00:00Z', requestedAt: now.toISOString(), sourceRequestId: 'request' }, now)).toBe(true)
  })
})
