import { describe, expect, it } from 'vitest'
import { deriveIntent } from '../reality/intent'
import { presentContact } from '../reality/present'
import { inQuietHours, localMinutes } from '../reality/evaluator'
import type { ContactProfile } from '../character/types'
import type { RelationshipState } from '../relationship/types'
import type { SimulationEvent } from '../event/types'
import type { NotificationSettings } from '../reality/types'

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

  it('a pending intent from the last turn wins, but call channels are downgraded until P8', () => {
    const i = deriveIntent({
      relationship: rel(), activeEvents: [], contactProfile: profile, idleMinutes: 0,
      pending: { channel: 'video_call', reason: 'wanted to see you', urgency: 0.5 },
    })
    expect(i?.reason).toBe('wanted to see you')
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

describe('quiet hours are judged in the user\'s timezone', () => {
  const base: NotificationSettings = {
    pushEnabled: true, voiceCallEnabled: true, videoCallEnabled: true,
    quietHoursEnabled: true, quietHoursStart: '23:00', quietHoursEnd: '08:00',
    timeZone: 'Asia/Seoul',
  }
  // 17:00Z = 02:00 Seoul (밤) = 18:00 London (낮)
  const instant = new Date('2026-09-12T17:00:00Z')

  it('the same instant is night in Seoul', () => {
    expect(localMinutes(instant, 'Asia/Seoul')).toBe(2 * 60)
    expect(inQuietHours(instant, base)).toBe(true)
  })

  it('and daytime in London', () => {
    expect(localMinutes(instant, 'Europe/London')).toBe(18 * 60)
    expect(inQuietHours(instant, { ...base, timeZone: 'Europe/London' })).toBe(false)
  })
})
