import { describe, expect, it } from 'vitest'
import { acceptLifeEvents, lifeEvidence, lifeWindow, type LifeProposal } from '../character/life'
import type { Routine } from '../reality/routine'

// 2026-10-02 '자기 삶': 대화가 없던 시간을 생활 리듬대로 산다 — 서버가 시간·잠·종류·길이·반복을 거른다.
const routine: Routine = { version: 1, source: 'authored', note: null, generatedAt: '2026-10-01T00:00:00Z', blocks: [
  { days: [], start: '00:00', end: '07:00', label: '수면', availability: 'unreachable' },
  { days: [], start: '09:00', end: '18:00', label: '근무', availability: 'busy' },
] }
const tz = 'Asia/Seoul'
const kst = (hhmm: string, day = '2026-10-02') => new Date(`${day}T${hhmm}:00+09:00`)

describe('life window', () => {
  it('waits for the step, starts after the last conversation and lists the awake blocks', () => {
    expect(lifeWindow({ lifeUntil: null, lastInteractionAt: kst('13:00'), now: kst('15:00'), routine, timeZone: tz })).toBeNull()
    const w = lifeWindow({ lifeUntil: kst('10:00'), lastInteractionAt: kst('13:00'), now: kst('19:00'), routine, timeZone: tz })!
    expect(w.from).toEqual(kst('13:00'))
    expect(w.awake).toEqual(['근무', '쉬는 시간'])
  })
  it('only sleeps through a night, keeps a long absence to the last day, and stops for an abandoned room', () => {
    expect(lifeWindow({ lifeUntil: kst('00:00'), lastInteractionAt: kst('20:00', '2026-10-01'), now: kst('06:30'), routine, timeZone: tz })!.awake).toEqual([])
    expect(lifeWindow({ lifeUntil: null, lastInteractionAt: kst('19:00', '2026-09-30'), now: kst('19:00'), routine, timeZone: tz })!.from).toEqual(kst('19:00', '2026-10-01'))
    expect(lifeWindow({ lifeUntil: null, lastInteractionAt: kst('19:00', '2026-09-28'), now: kst('19:00'), routine, timeZone: tz })).toBeNull()
  })
})

describe('accepting proposed life events', () => {
  const window = { from: kst('13:00'), to: kst('19:00'), awake: ['근무'] }
  const event = (over: Partial<LifeProposal>): LifeProposal => ({ at: '2026-10-02T15:30:00+09:00', kind: 'work', summary: '오후 점검에서 사각지대를 찾았다.', valence: .2, intensity: .4, shareable: true, ...over })
  it('keeps awake, in-window, well-formed, new events in time order with the routine\'s own block name', () => {
    const kept = acceptLifeEvents([
      event({ at: '2026-10-02T18:30:00+09:00', kind: 'errand', summary: '퇴근길에 장을 봤다.', shareable: false }),
      event({}),
      event({ at: '2026-10-02T12:00:00+09:00', summary: '창 밖이 다 시간 밖이다.' }),
      event({ kind: 'party', summary: '모르는 종류.' }),
      event({ summary: '가'.repeat(161) }),
      event({ summary: '어제와 같은 일.' }),
    ], window, ['어제와 같은 일.'], routine, tz)
    expect(kept.map(e => [e.block, e.summary])).toEqual([['근무', '오후 점검에서 사각지대를 찾았다.'], ['쉬는 시간', '퇴근길에 장을 봤다.']])
  })
  it('never keeps more than two, and nothing while asleep', () => {
    expect(acceptLifeEvents([event({ summary: 'a' }), event({ summary: 'b' }), event({ summary: 'c' })], window, [], routine, tz)).toHaveLength(2)
    const night = { from: kst('00:00'), to: kst('08:00'), awake: ['쉬는 시간'] }
    expect(acceptLifeEvents([event({ at: '2026-10-02T03:00:00+09:00' }), event({ at: '2026-10-02T07:30:00+09:00', summary: '일찍 일어나 뛰었다.' })], night, [], routine, tz)
      .map(e => e.summary)).toEqual(['일찍 일어나 뛰었다.'])
  })
  it('becomes the character\'s own observed evidence that the user does not know yet', () => {
    const [evidence] = lifeEvidence([{ id: 'e1', occurredAt: kst('15:30').toISOString(), block: '근무', kind: 'work', summary: '사각지대를 찾았다.', valence: .2, intensity: .4, shareable: true }], 's1', 'c1', tz)
    expect(evidence).toEqual({ sessionId: 's1', id: 'life:e1', quote: '근무 중: 사각지대를 찾았다.', actor: 'c1', occurredAt: '2026-10-02T15:30:00.000+09:00',
      kind: 'event', epistemic: 'observed', knownTo: ['c1'], shareable: true })
  })
})
