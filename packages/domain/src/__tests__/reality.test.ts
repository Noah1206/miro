import { describe, expect, it } from 'vitest'
import { evaluateRealityContact, localDay } from '../reality/evaluator'
import { FIRST_CONTACT_REASON } from '../reality/intent'
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

// 2026-10-02 — 하루 상한은 캐릭터마다(성격·관계), 첫 연락은 동기 검사 없이 세션에 한 번, 중복 방지 키는 사건·상태 / 현지 날짜.
describe('daily cap, first contact and dedupe keys', () => {
  it('stops at the character\'s own daily cap, but a reply to the user still goes', () => {
    expect(evaluateRealityContact(input({ contactsToday: 2, dailyCap: 2 }))).toEqual({ send: false, reason: 'daily_cap' })
    expect(evaluateRealityContact(input({ contactsToday: 1, dailyCap: 2 })).send).toBe(true)
    expect(evaluateRealityContact(input({ contactsToday: 5, dailyCap: 2, intent: { channel: 'message', reason: 'reply', urgency: 0.9, answers: 'user_message', notBefore: '2026-09-12T05:00:00.000Z' } })).send).toBe(true)
  })
  it('the first contact skips the motivation check and is keyed once per session', () => {
    const stranger = { ...rel, trust: 15, attachment: 5, emotionalDistance: 80, stage: 'stranger' as const }
    const d = evaluateRealityContact(input({ relationship: stranger, intent: { channel: 'message', reason: FIRST_CONTACT_REASON, urgency: 0.5 } }))
    expect(d).toEqual({ send: true, channel: 'message', dedupeKey: 'message:first_contact' })
  })
  it('a meal-time check-in is not re-judged by the motivation formula — like silence, the relationship threshold already decided', () => {
    const settled = { ...rel, trust: 40, attachment: 40, emotionalDistance: 55 }
    const meal = { channel: 'message' as const, reason: 'checkin:저녁 — 저녁 먹었는지 묻는다', urgency: 0.4 }
    expect(evaluateRealityContact(input({ relationship: settled, intent: meal })).send).toBe(true)
    expect(evaluateRealityContact(input({ relationship: settled, intent: { ...meal, reason: '그냥 생각나서' } }))).toEqual({ send: false, reason: 'no_motivation' })
  })
  it('an event-rule intent is not re-judged by the motivation formula — the rule and the character\'s profile already decided', () => {
    // 만나고 헤어진 뒤 안부: 막 알게 된 사이(신뢰 35·거리 60)라도 규칙 조건을 넘었으면 나간다. 같은 의도가 규칙 없이 오면 예전처럼 동기로 거른다.
    const justMet = { ...rel, trust: 35, attachment: 10, emotionalDistance: 60 }
    const afterScene = { channel: 'message' as const, reason: '조금 전 만나고 헤어진 뒤 안부', urgency: 0.5 }
    expect(evaluateRealityContact(input({ relationship: justMet, intent: { ...afterScene, rule: 'after_scene' } })).send).toBe(true)
    expect(evaluateRealityContact(input({ relationship: justMet, intent: afterScene }))).toEqual({ send: false, reason: 'no_motivation' })
  })
  it('keys event contacts by event and status, rule intents by the user\'s local day, and replies by their time', () => {
    const key = (intent: RealityInput['intent'], now = new Date('2026-09-12T08:30:00+09:00')) => (evaluateRealityContact(input({ intent, now })) as { dedupeKey: string }).dedupeKey
    expect(key({ channel: 'message', reason: 'event:crisis', urgency: 0.9, eventKey: 'e1:active' })).toBe('message:event:e1:active:event:crisis')
    // 08:30 KST 는 UTC 로는 전날 — 한국 사용자의 하루는 한국 날짜로 센다.
    expect(key({ channel: 'message', reason: '질투', urgency: 0.9, notBefore: '2026-09-11T23:00:00.000Z' })).toBe('message:2026-09-12:질투')
    expect(key({ channel: 'message', reason: 'reply', urgency: 0.9, answers: 'user_message', notBefore: '2026-09-11T23:00:00.000Z' })).toBe('message:at:2026-09-11T23:00:00.000Z:reply')
    expect(localDay(new Date('2026-09-12T08:30:00+09:00'), 'Asia/Seoul')).toBe('2026-09-12')
  })
})
