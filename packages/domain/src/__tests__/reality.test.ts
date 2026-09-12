import { describe, expect, it } from 'vitest'
import { evaluateRealityContact, inQuietHours } from '../reality/evaluator'
import type { NotificationSettings } from '../reality/types'
import type { RealityDecision, RealityInput } from '../reality/evaluator'
import type { ContactProfile } from '../character/types'
import type { RelationshipState } from '../relationship/types'

const settings: NotificationSettings = {
  pushEnabled: true, voiceCallEnabled: true, videoCallEnabled: true,
  quietHoursEnabled: true, quietHoursStart: '23:00', quietHoursEnd: '08:00',
  timeZone: 'Asia/Seoul',
}

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
    settings,
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

  it('T-QuietHours: suppresses intrusive channels at night but keeps state intact', () => {
    const d = evaluateRealityContact(input({ now: new Date('2026-09-12T02:00:00+09:00') }))
    expect(d).toEqual({ send: false, reason: 'quiet_hours' })
  })

  it('quiet hours spanning midnight is handled correctly', () => {
    expect(inQuietHours(new Date('2026-09-12T23:30:00+09:00'), settings)).toBe(true)
    expect(inQuietHours(new Date('2026-09-12T03:00:00+09:00'), settings)).toBe(true)
    expect(inQuietHours(new Date('2026-09-12T12:00:00+09:00'), settings)).toBe(false)
  })

  it('respects a disabled channel', () => {
    const d = evaluateRealityContact(input({
      intent: { channel: 'video_call', reason: 'x', urgency: 1 },
      settings: { ...settings, videoCallEnabled: false },
    }))
    expect(d).toEqual({ send: false, reason: 'channel_disabled' })
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
