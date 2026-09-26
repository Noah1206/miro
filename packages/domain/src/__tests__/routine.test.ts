import { describe, expect, it } from 'vitest'
import { localClock } from '../time/clock'
import { availabilityAt, defaultRoutine, normalizeActiveHours, parseRoutine, type Routine } from '../reality/routine'

const at = (iso: string) => localClock(new Date(iso), 'Asia/Seoul')
const routine: Routine = { version: 1, source: 'authored', note: null, generatedAt: 'x', blocks: [
  { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', label: '근무', availability: 'busy' },
  { days: [], start: '23:30', end: '07:00', label: '자는 중', availability: 'unreachable' },
  { days: [1], start: '12:00', end: '13:00', label: '점심', availability: 'free' },
] }

describe('routine availability', () => {
  it('is free outside every block', () => {
    expect(availabilityAt(routine, at('2026-09-26T11:00:00Z'))).toEqual({ availability: 'free', label: null, minutesUntilFree: null })   // 토 20:00
  })
  it('is busy during weekday work and knows when it ends', () => {
    expect(availabilityAt(routine, at('2026-09-28T01:30:00Z'))).toEqual({ availability: 'busy', label: '근무', minutesUntilFree: 450 })   // 월 10:30 → 18:00
  })
  it('handles overnight sleep on both sides of midnight', () => {
    expect(availabilityAt(routine, at('2026-09-26T15:00:00Z')).label).toBe('자는 중')     // 토 00:00 (금요일 밤에 시작)
    expect(availabilityAt(routine, at('2026-09-26T21:30:00Z')).minutesUntilFree).toBe(30)  // 일 06:30
  })
  it('the more unreachable block wins an overlap, and free blocks do not shorten anything', () => {
    // 월 12:30 — 근무(busy) 와 점심(free) 겹침 → busy 가 이긴다 (점심에도 자리를 비우지 않는 캐릭터)
    expect(availabilityAt(routine, at('2026-09-28T03:30:00Z')).availability).toBe('busy')
  })
  it('no routine means always reachable', () => {
    expect(availabilityAt(null, at('2026-09-26T15:00:00Z')).availability).toBe('free')
  })
  it('default routine sleeps outside active hours', () => {
    const r = defaultRoutine({ start: '08:00', end: '23:00' }, 'x')
    expect(availabilityAt(r, at('2026-09-26T16:00:00Z'))).toMatchObject({ availability: 'unreachable', label: '자는 중', minutesUntilFree: 420 })  // 01:00
    expect(availabilityAt(r, at('2026-09-26T03:00:00Z')).availability).toBe('free')  // 12:00
  })
})

describe('parseRoutine', () => {
  it('accepts a valid model answer and trims labels', () => {
    const r = parseRoutine({ blocks: [{ days: [0, 6], start: '22:00', end: '04:00', label: ' 야간 순찰 ', availability: 'busy' }], note: '밤에 움직인다' }, 'generated', 'now')
    expect(r?.blocks[0]).toEqual({ days: [0, 6], start: '22:00', end: '04:00', label: '야간 순찰', availability: 'busy' })
    expect(r?.note).toBe('밤에 움직인다')
  })
  it('rejects anything half-right', () => {
    expect(parseRoutine({ blocks: [] }, 'generated', 'x')).toBeNull()
    expect(parseRoutine({ blocks: [{ days: [7], start: '09:00', end: '10:00', label: 'x', availability: 'busy' }] }, 'generated', 'x')).toBeNull()
    expect(parseRoutine({ blocks: [{ days: [], start: '09:00', end: '09:00', label: 'x', availability: 'busy' }] }, 'generated', 'x')).toBeNull()
    expect(parseRoutine({ blocks: [{ days: [], start: '09:00', end: '10:00', label: 'x', availability: 'away' }] }, 'generated', 'x')).toBeNull()
    expect(parseRoutine('nope', 'generated', 'x')).toBeNull()
  })
})

describe('default routine is always usable', () => {
  it('treats 24:00 as midnight, a full day as always awake, and garbage as 08-23', () => {
    expect(normalizeActiveHours({ start: '07:00', end: '24:00' })).toEqual({ start: '07:00', end: '00:00' })
    expect(normalizeActiveHours({ start: '00:00', end: '24:00' })).toBeNull()
    expect(normalizeActiveHours({ start: 'x', end: '25:00' })).toEqual({ start: '08:00', end: '23:00' })
    for (const h of [{ start: '07:00', end: '24:00' }, { start: '00:00', end: '24:00' }, { start: '10:00', end: '10:00' }, { start: 'x', end: 'y' }]) {
      const r = defaultRoutine(h, 'now')
      expect(parseRoutine(r, 'default', 'now')).not.toBeNull()
    }
    expect(availabilityAt(defaultRoutine({ start: '00:00', end: '24:00' }, 'now'), localClock(new Date('2026-09-26T18:00:00Z'), 'Asia/Seoul')).availability).toBe('free')
  })
})
