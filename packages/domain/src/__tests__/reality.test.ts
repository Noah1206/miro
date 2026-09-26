import { describe, expect, it } from 'vitest'
import { evaluateRealityContact } from '../reality/evaluator'
import type { RealityDecision, RealityInput } from '../reality/evaluator'
import type { ContactProfile } from '../character/types'
import type { RelationshipState } from '../relationship/types'

const profile: ContactProfile = {
  id: 'cp1', characterId: 'c1', contactFrequency: 50, replyDelayMinutes: 5,
  preferredChannel: 'message', callProbability: 0.3, videoCallProbability: 0.1,
  photoProbability: 0.2, voiceMessageProbability: 0.2,
  activeHours: { start: '00:00', end: '23:59' }, initiativeLevel: 80,
}

const rel: RelationshipState = {
  id: 'r1', sessionId: 's1', version: 1,
  trust: 80, attraction: 60, jealousy: 20, protectiveness: 50,
  emotionalDistance: 10, attachment: 80, stage: 'friend',
  unresolvedEventIds: [], updatedAt: new Date(),
}

function input(over: Partial<RealityInput> = {}): RealityInput {
  return {
    intent: { channel: 'push', reason: 'missed_you', urgency: 0.8 },
    contactProfile: profile,
    personality: { initiative: 80, emotionalExpression: 60 },
    relationship: rel,
    activeEvents: [],
    timeZone: 'Asia/Seoul',
    lastContactAt: null,
    pendingContacts: [],
    now: new Date('2026-09-12T14:00:00+09:00'),
    ...over,
  }
}

describe('reality activation', () => {
  it('sends when the character has motivation right now', () => {
    const d = evaluateRealityContact(input())
    expect(d.send).toBe(true)
  })

  // 사용자 쪽 야간 차단은 없다. 밤에 조용한 건 캐릭터의 활동 시간(기본 08~23시) 때문이고, 사용자 현지 시각으로 본다.
  it('at night the character keeps to its own active hours, in the user\'s time zone', () => {
    const daytime = { ...profile, activeHours: { start: '08:00', end: '23:00' } }
    const instant = new Date('2026-09-12T17:00:00Z') // 02:00 Seoul, 18:00 London
    expect(evaluateRealityContact(input({ contactProfile: daytime, now: instant }))).toEqual({ send: false, reason: 'outside_active_hours' })
    expect(evaluateRealityContact(input({ contactProfile: daytime, now: instant, timeZone: 'Europe/London' })).send).toBe(true)
  })

  it('no user switch turns a channel off', () => {
    expect(evaluateRealityContact(input({ intent: { channel: 'video_call', reason: 'x', urgency: 1 } })).send).toBe(true)
  })

  it('T-Dedupe: cooldown prevents repeat contact spam', () => {
    const d = evaluateRealityContact(input({ lastContactAt: new Date('2026-09-12T13:30:00+09:00') }))
    expect(d).toEqual({ send: false, reason: 'cooldown' })
  })

  it('T8: after a fight, a distant/low-attachment character does not cheerfully reach out', () => {
    const distant = { ...rel, emotionalDistance: 95, attachment: 20, trust: 20 }
    const d = evaluateRealityContact(input({
      relationship: distant,
      personality: { initiative: 20, emotionalExpression: 30 },
      contactProfile: { ...profile, initiativeLevel: 20 },
    }))
    expect(d).toEqual({ send: false, reason: 'no_motivation' })
  })

  it('an urgent unresolved event can override emotional distance', () => {
    const distant = { ...rel, emotionalDistance: 80, attachment: 70 }
    const d = evaluateRealityContact(input({
      relationship: distant,
      intent: { channel: 'push', reason: 'crisis', urgency: 1 },
      activeEvents: [{
        id: 'e1', sessionId: 's1', type: 'crisis', status: 'active',
        context: {}, participantNpcIds: [], continuationState: {}, consequences: [],
        cooldownUntilTurn: 0, createdAtTurn: 1, resolvedAtTurn: null,
      }],
    }))
    expect(d.send).toBe(true)
  })

  it('T1: identical elapsed time is never the trigger — only state is', () => {
    const now = new Date('2026-09-12T14:00:00+09:00')
    const warm: RealityDecision = evaluateRealityContact(input({ now }))
    const cold: RealityDecision = evaluateRealityContact(input({
      now,
      relationship: { ...rel, emotionalDistance: 95, attachment: 15, trust: 15 },
      personality: { initiative: 10, emotionalExpression: 20 },
      contactProfile: { ...profile, initiativeLevel: 10 },
    }))
    expect(warm.send).toBe(true)
    expect(cold.send).toBe(false)
  })

  it('caps pending contacts', () => {
    const pending = [1, 2].map((i) => ({
      id: `p${i}`, sessionId: 's1', channel: 'push' as const, dedupeKey: `k${i}`,
      payload: {}, status: 'pending' as const, suppressedReason: null,
      createdAt: new Date(), sentAt: null,
    }))
    expect(evaluateRealityContact(input({ pendingContacts: pending })))
      .toEqual({ send: false, reason: 'max_pending' })
  })
})

describe('routine availability gates contact', () => {
  it('nothing goes out while the character is unreachable, even with a strong reason', () => {
    expect(evaluateRealityContact(input({ availability: 'unreachable', intent: { channel: 'message', reason: 'event:crisis', urgency: 0.95 } })))
      .toEqual({ send: false, reason: 'outside_active_hours' })
  })
  it('busy lets only urgent contact through', () => {
    expect(evaluateRealityContact(input({ availability: 'busy', intent: { channel: 'message', reason: 'silence', urgency: 0.4 } })))
      .toEqual({ send: false, reason: 'busy' })
    expect(evaluateRealityContact(input({ availability: 'busy', intent: { channel: 'message', reason: 'event:crisis', urgency: 0.9 } })).send).toBe(true)
  })
  it('free ignores the old active-hours window — the routine is the schedule now', () => {
    const night = new Date('2026-09-12T03:00:00+09:00')
    expect(evaluateRealityContact(input({ now: night, availability: 'free', contactProfile: { ...profile, activeHours: { start: '08:00', end: '23:00' } } })).send).toBe(true)
    expect(evaluateRealityContact(input({ now: night, contactProfile: { ...profile, activeHours: { start: '08:00', end: '23:00' } } })).send).toBe(false)
  })
})

describe('replies and call follow-ups are not contacts', () => {
  const cold = { ...rel, trust: 20, attachment: 10, emotionalDistance: 60 }
  it('a delayed reply to the user skips motivation, cooldown and the unread cap', () => {
    const r = evaluateRealityContact(input({ relationship: cold, lastContactAt: new Date('2026-09-12T13:50:00+09:00'),
      pendingContacts: [{} as never, {} as never, {} as never],
      intent: { channel: 'message', reason: '수업 중에 온 문자에 답장', urgency: 0.9, notBefore: '2026-09-12T13:59:00+09:00', answers: 'user_message' } }))
    expect(r.send).toBe(true)
  })
  it('a call follow-up skips motivation but still respects cooldown', () => {
    expect(evaluateRealityContact(input({ relationship: cold, intent: { channel: 'message', reason: '못 받은 전화', urgency: 0.6, answers: 'call' } })).send).toBe(true)
    expect(evaluateRealityContact(input({ relationship: cold, lastContactAt: new Date('2026-09-12T13:50:00+09:00'), intent: { channel: 'message', reason: '못 받은 전화', urgency: 0.6, answers: 'call' } })))
      .toEqual({ send: false, reason: 'cooldown' })
  })
  it('two scheduled intents with the same reason on one day get different dedupe keys', () => {
    const a = evaluateRealityContact(input({ intent: { channel: 'message', reason: '답장', urgency: 0.9, notBefore: '2026-09-12T10:00:00Z', answers: 'user_message' } }))
    const b = evaluateRealityContact(input({ intent: { channel: 'message', reason: '답장', urgency: 0.9, notBefore: '2026-09-12T12:00:00Z', answers: 'user_message' } }))
    expect(a.send && b.send && a.dedupeKey !== b.dedupeKey).toBe(true)
  })
})
