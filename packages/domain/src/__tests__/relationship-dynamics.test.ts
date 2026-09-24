import { describe, expect, it } from 'vitest'
import {
  addDelta, applyRelationshipDelta, bondingCurveOf, closeness, companionshipDelta, deriveIntent, evaluateRealityContact,
  readyToReachOut, relationshipKind, scaleCloser, silenceHours,
  type BondingCurve, type ContactProfile, type RelationshipStage, type RelationshipState,
} from '../index'

/** 강태준의 실제 시작값 — 운영에서 20턴 동안 한 번도 움직이지 않았던 관계. */
const start = (over: Partial<RelationshipState> = {}): RelationshipState => ({
  id: 'r', sessionId: 's', version: 1, trust: 30, attraction: 5, jealousy: 0, protectiveness: 10,
  emotionalDistance: 65, attachment: 5, stage: 'stranger', unresolvedEventIds: [], updatedAt: new Date(), ...over,
})
const talk = '무슨 일이 있었는지 처음부터 말씀드릴게요.'

/** 사건 없이 대화만 n턴 이어 간다. 단계는 고정해 곡선 모양만 본다. */
function chat(curve: BondingCurve, turns: number, from = start()): number[] {
  let r = from
  const attachment = [r.attachment]
  for (let turn = 1; turn <= turns; turn++) {
    r = applyRelationshipDelta(r, companionshipDelta({ curve, relationship: r, events: [], turn, userInput: talk }))
    attachment.push(r.attachment)
  }
  return attachment
}
const steps = (xs: number[]) => xs.slice(1).map((x, n) => x - xs[n]!)

describe('bonding curves — how fast a character warms up depends on who they are', () => {
  it('steady grows the same every turn', () => {
    expect(steps(chat('steady', 12)).every(s => s === 1)).toBe(true)
  })
  it('slow moves once every three turns', () => {
    expect(chat('slow', 12).at(-1)).toBe(5 + 4)
  })
  it('accelerating starts like steady, then each turn counts for more', () => {
    const s = steps(chat('accelerating', 24))
    expect(s[0]).toBe(1)
    expect(s.at(-1)!).toBeGreaterThan(1)
    expect(chat('accelerating', 24).at(-1)!).toBeGreaterThan(chat('steady', 24).at(-1)!)
  })
  it('stepwise stays flat, then jumps', () => {
    const a = chat('stepwise', 16)
    expect(a.slice(0, 8).every(x => x === 5)).toBe(true)
    expect(a[8]).toBe(10)
    expect(a[16]).toBe(15)
  })
  it('stepwise also jumps on a key moment', () => {
    const d = companionshipDelta({ curve: 'stepwise', relationship: start(), events: [{ type: 'shared_secret', confidence: 0.9 }], turn: 3, userInput: talk })
    expect(d.attachment).toBe(5)
  })
  it('no growth on a bad turn or a throwaway reply', () => {
    expect(companionshipDelta({ curve: 'steady', relationship: start(), events: [{ type: 'hostility', confidence: 0.85 }], turn: 1, userInput: talk })).toEqual({})
    expect(companionshipDelta({ curve: 'steady', relationship: start(), events: [], turn: 1, userInput: 'ㅇㅇ' })).toEqual({})
  })
  it('the curve comes from the author, otherwise from the reaction traits', () => {
    expect(bondingCurveOf({ initiative: 50, emotionalExpression: 50 }, 'slow')).toBe('slow')
    expect(bondingCurveOf({ initiative: 80, emotionalExpression: 80 })).toBe('accelerating')
    expect(bondingCurveOf({ initiative: 20, emotionalExpression: 20 })).toBe('slow')
    expect(bondingCurveOf({ initiative: 50, emotionalExpression: 20 })).toBe('stepwise')
    expect(bondingCurveOf({ initiative: 50, emotionalExpression: 50 }, 'nonsense')).toBe('steady')
  })
  it('the curve also scales how much an event brings them closer, never how much it pushes them away', () => {
    expect(scaleCloser({ attachment: 6, emotionalDistance: -4, trust: -3 }, 'slow', 20)).toEqual({ attachment: 3, emotionalDistance: -2, trust: -3 })
    expect(scaleCloser({ attachment: 6 }, 'accelerating', 60).attachment).toBe(10)
    expect(addDelta({ trust: 2 }, { trust: 1, attachment: 1 })).toEqual({ trust: 3, attachment: 1 })
  })
})

describe('relationship kind decides what grows and what "close" means', () => {
  const grow = (stage: RelationshipStage) => companionshipDelta({ curve: 'steady', relationship: start({ stage }), events: [], turn: 1, userInput: talk })
  it('work builds trust, romance builds attachment and attraction, tension only thaws', () => {
    expect(grow('professional')).toEqual({ emotionalDistance: -1, trust: 1 })
    expect(grow('flirting')).toEqual({ emotionalDistance: -1, attachment: 1, attraction: 1 })
    expect(grow('rivalry')).toEqual({ emotionalDistance: -1 })
  })
  it('kind follows the stage', () => {
    expect(relationshipKind('lover')).toBe('romance')
    expect(relationshipKind('professional')).toBe('work')
    expect(relationshipKind('stranger')).toBe('new')
  })
})

describe('reaching out after a silence', () => {
  it('a stranger is not ready at first, and is after enough steady conversation', () => {
    expect(readyToReachOut(start(), 50)).toBe(false)
    let r = start()
    for (let turn = 1; turn <= 18; turn++) r = applyRelationshipDelta(r, companionshipDelta({ curve: 'steady', relationship: r, events: [], turn, userInput: talk }))
    expect(closeness(r)).toBeGreaterThanOrEqual(40)
    expect(readyToReachOut(r, 50)).toBe(true)
  })
  it('lovers are ready from the start; an eager character needs less; a fight blocks it', () => {
    expect(readyToReachOut(start({ stage: 'lover', trust: 80, attraction: 80, attachment: 75, emotionalDistance: 15 }), 50)).toBe(true)
    const near = start({ trust: 40, attachment: 20, emotionalDistance: 55 }) // closeness 35
    expect(readyToReachOut(near, 50)).toBe(false)
    expect(readyToReachOut(near, 80)).toBe(true)
    expect(readyToReachOut(start({ stage: 'friend', trust: 90, attachment: 90, emotionalDistance: 85 }), 80)).toBe(false)
  })
  it('the silence before reaching out shrinks as they grow closer, and depends on the kind of relationship', () => {
    const friend = start({ stage: 'friend', trust: 60, attachment: 50, emotionalDistance: 40 })
    expect(silenceHours(friend, 50, 50)).toBeLessThan(silenceHours(start(), 50, 50))
    expect(silenceHours({ ...friend, stage: 'lover' }, 50, 50)).toBeLessThan(silenceHours(friend, 50, 50))
    expect(silenceHours({ ...friend, stage: 'professional' }, 50, 50)).toBeGreaterThan(silenceHours(friend, 50, 50))
    expect(silenceHours(friend, 50, 80)).toBeLessThan(silenceHours(friend, 50, 50))
  })

  const profile: ContactProfile = {
    id: 'cp', characterId: 'c', enabled: true, contactFrequency: 45, replyDelayMinutes: 5, preferredChannel: 'message',
    callProbability: 0, videoCallProbability: 0, photoProbability: 0, voiceMessageProbability: 0,
    activeHours: { start: '00:00', end: '23:59' }, initiativeLevel: 50,
  }
  it('the intent follows readiness and the dynamic silence, and the evaluator does not veto it again', () => {
    const idle = 60 * 60 // 60시간
    expect(deriveIntent({ relationship: start(), activeEvents: [], contactProfile: profile, idleMinutes: idle, pending: null })).toBeNull()
    const grown = start({ stage: 'acquaintance', trust: 50, attachment: 25, emotionalDistance: 45 })
    const intent = deriveIntent({ relationship: grown, activeEvents: [], contactProfile: profile, idleMinutes: idle, pending: null })
    expect(intent?.reason).toBe('silence')
    expect(evaluateRealityContact({
      intent: intent!, contactProfile: profile, personality: { initiative: 50, emotionalExpression: 50 }, relationship: grown,
      activeEvents: [], timeZone: 'Asia/Seoul', lastContactAt: null, pendingContacts: [], now: new Date('2026-09-24T05:00:00Z'),
    }).send).toBe(true)
  })
})
