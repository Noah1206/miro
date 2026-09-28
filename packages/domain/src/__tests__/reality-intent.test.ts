import { describe, expect, it } from 'vitest'
import { deriveIntent } from '../reality/intent'
import { presentContact } from '../reality/present'
import { localMinutes } from '../reality/evaluator'
import type { ContactProfile } from '../character/types'
import type { RelationshipState } from '../relationship/types'
import type { SimulationEvent } from '../event/types'

const profile: ContactProfile = {
  id: 'cp', characterId: 'c', contactFrequency: 50, replyDelayMinutes: 5,
  preferredChannel: 'message', callProbability: 0.3, videoCallProbability: 0.1,
  photoProbability: 0.2, voiceMessageProbability: 0.2,
  activeHours: { start: '08:00', end: '23:00' }, initiativeLevel: 50,
}
const rel = (over: Partial<RelationshipState> = {}): RelationshipState => ({
  id: 'r', sessionId: 's', version: 1, trust: 50, attraction: 20, jealousy: 0,
  protectiveness: 20, emotionalDistance: 40, attachment: 50, stage: 'friend',
  unresolvedEventIds: [], updatedAt: new Date(), ...over,
})
const event = (over: Partial<SimulationEvent> = {}): SimulationEvent => ({
  id: 'e', sessionId: 's', type: 'crisis', status: 'active', context: {},
  participantNpcIds: [], continuationState: {}, consequences: [],
  cooldownUntilTurn: 0, createdAtTurn: 1, resolvedAtTurn: null, ...over,
})

describe('intent derivation — reasons come from state, never from a schedule', () => {
  it('returns nothing when there is no reason to reach out', () => {
    expect(deriveIntent({
      relationship: rel({ attachment: 10, emotionalDistance: 80 }),
      activeEvents: [], contactProfile: profile, idleMinutes: 60 * 24 * 10, pending: null,
    })).toBeNull()
  })

  it('an unresolved event produces an intent regardless of emotional distance', () => {
    const i = deriveIntent({
      relationship: rel({ emotionalDistance: 90, attachment: 10 }),
      activeEvents: [event()], contactProfile: profile, idleMinutes: 10, pending: null,
    })
    expect(i?.reason).toBe('event:crisis')
    expect(i?.urgency).toBeGreaterThanOrEqual(0.7)
  })

  it('an escalated event is more urgent than an active one', () => {
    const a = deriveIntent({ relationship: rel(), activeEvents: [event()], contactProfile: profile, idleMinutes: 0, pending: null })
    const b = deriveIntent({ relationship: rel(), activeEvents: [event({ status: 'escalated' })], contactProfile: profile, idleMinutes: 0, pending: null })
    expect(b!.urgency).toBeGreaterThan(a!.urgency)
  })

  it('T8: after a fight, silence alone does not produce a "missed you"', () => {
    expect(deriveIntent({
      relationship: rel({ emotionalDistance: 85, attachment: 60 }),
      activeEvents: [], contactProfile: profile, idleMinutes: 60 * 48, pending: null,
    })).toBeNull()
  })

  it('long silence with a bond produces a low-urgency intent', () => {
    const i = deriveIntent({
      relationship: rel({ emotionalDistance: 30, attachment: 60 }),
      activeEvents: [], contactProfile: profile, idleMinutes: 60 * 48, pending: null,
    })
    expect(i?.reason).toBe('silence')
    expect(i!.urgency).toBeLessThanOrEqual(0.6)
  })

  it('a reserved character waits longer than an eager one', () => {
    const args = { relationship: rel({ emotionalDistance: 30, attachment: 60 }), activeEvents: [], idleMinutes: 60 * 20, pending: null }
    expect(deriveIntent({ ...args, contactProfile: { ...profile, contactFrequency: 10 } })).toBeNull()
    expect(deriveIntent({ ...args, contactProfile: { ...profile, contactFrequency: 95 } })).not.toBeNull()
  })

  it('a pending intent from the last turn wins, including call channels', () => {
    const i = deriveIntent({
      relationship: rel(), activeEvents: [], contactProfile: profile, idleMinutes: 0,
      pending: { channel: 'video_call', reason: 'wanted to see you', urgency: 0.5 },
    })
    expect(i?.reason).toBe('wanted to see you')
    expect(i?.channel).toBe('video_call')
  })

  it('missed_call is a result, never an intent — it is downgraded to a message', () => {
    const i = deriveIntent({
      relationship: rel(), activeEvents: [], contactProfile: profile, idleMinutes: 0,
      pending: { channel: 'missed_call', reason: 'x', urgency: 0.5 },
    })
    expect(i?.channel).toBe('message')
  })
})

describe('world translation', () => {
  it('falls back to the character name and a plain label', () => {
    expect(presentContact('message', '강태윤', null))
      .toEqual({ senderLabel: '강태윤', channelLabel: '메시지' })
  })

  it('applies a world-specific sender and channel label', () => {
    expect(presentContact('message', '히사시', {
      senderLabel: '알 수 없는 번호', channelLabels: { message: '문자' },
    })).toEqual({ senderLabel: '알 수 없는 번호', channelLabel: '문자' })
  })

  it('only overrides the channels the world defines', () => {
    const p = presentContact('photo', '토마스', { channelLabels: { message: '편지' } })
    expect(p.channelLabel).toBe('사진')
  })
})

describe('local time is judged in the user\'s timezone', () => {
  // 17:00Z = 02:00 Seoul (밤) = 18:00 London (낮)
  const instant = new Date('2026-09-12T17:00:00Z')

  it('the same instant is night in Seoul and daytime in London', () => {
    expect(localMinutes(instant, 'Asia/Seoul')).toBe(2 * 60)
    expect(localMinutes(instant, 'Europe/London')).toBe(18 * 60)
  })
})

// ── 선연락 on/off 스위치 (contact_profiles.enabled) ─────────────────────────────
// 빈도 0 은 '3일에 한 번' 이지 '안 함' 이 아니라 별도 스위치가 있다. 꺼지면 어떤 이유로도 나가지 않는다.
const switchProfile = (over: Partial<ContactProfile> = {}): ContactProfile => ({
  id: 'p', characterId: 'c', contactFrequency: 80, replyDelayMinutes: 5, preferredChannel: 'message',
  callProbability: 0, videoCallProbability: 0, photoProbability: 0, voiceMessageProbability: 0,
  activeHours: { start: '00:00', end: '23:59' }, initiativeLevel: 80, ...over,
})
const switchBonded = { attachment: 80, emotionalDistance: 20, trust: 60, jealousy: 0, protectiveness: 20, unresolvedEventIds: [] } as never

describe('선연락 on/off 스위치', () => {
  it('켜져 있으면(기본) 긴 침묵에 연락할 이유를 찾는다', () => {
    const i = deriveIntent({ relationship: switchBonded, activeEvents: [], contactProfile: switchProfile(), idleMinutes: 60 * 72, pending: null })
    expect(i?.reason).toBe('silence')
  })
  it('꺼져 있으면 침묵이 아무리 길어도 연락하지 않는다', () => {
    const i = deriveIntent({ relationship: switchBonded, activeEvents: [], contactProfile: switchProfile({ enabled: false }), idleMinutes: 60 * 720, pending: null })
    expect(i).toBeNull()
  })
  it('꺼져 있으면 RP 가 남긴 의도도 밖으로 나가지 않는다', () => {
    const pending = { channel: 'message', reason: 'rp', urgency: 0.9 } as never
    const i = deriveIntent({ relationship: switchBonded, activeEvents: [], contactProfile: switchProfile({ enabled: false }), idleMinutes: 0, pending })
    expect(i).toBeNull()
  })
})

describe('meal-time check-in', () => {
  const clock = (hour: number) => ({ iso: '2026-09-26T00:00:00Z', timeZone: 'Asia/Seoul', label: 'x', weekday: 6, hour, minute: 10, period: '저녁' as const })
  const base = { relationship: rel({ trust: 70, attachment: 70, emotionalDistance: 20 }), activeEvents: [], contactProfile: profile, idleMinutes: 240, pending: null, availability: 'free' as const, lastContactAt: null }
  it('asks about dinner at dinner time when the character is free and it has been quiet', () => {
    const intent = deriveIntent({ ...base, clock: clock(19) })
    expect(intent?.reason).toContain('checkin:저녁')
    expect(intent?.channel).toBe('message')
  })
  it('stays quiet outside meal windows, when busy, when recently in touch, or when the relationship is not there yet', () => {
    const reason = (over: object) => deriveIntent({ ...base, ...over })?.reason ?? ''
    expect(reason({ clock: clock(15) })).not.toContain('checkin')
    expect(reason({ clock: clock(19), availability: 'busy' })).not.toContain('checkin')
    expect(reason({ clock: clock(19), lastContactAt: new Date(Date.now() - 2 * 3_600_000) })).not.toContain('checkin')
    expect(deriveIntent({ ...base, clock: clock(19), relationship: rel({ attachment: 5, trust: 5, emotionalDistance: 80 }) })).toBeNull()
  })
})
