import { describe, expect, it } from 'vitest'
import { detectSemanticEvents, mergeSemanticEvents } from '../relationship/semantic'
import { deltaFromSemanticEvents, mergeRelationshipDelta, LLM_NUANCE_LIMIT } from '../relationship/rules'
import { DEFAULT_CHARACTER_STATE, deriveCharacterState } from '../character/state'
import { retrieveMemories, groupByLayer } from '../memory/layers'
import { evaluateEventRules } from '../event/rules'
import type { RelationshipState } from '../relationship/types'

const rel = (over: Partial<RelationshipState> = {}): RelationshipState => ({
  id: 'r', sessionId: 's', version: 1, trust: 50, attraction: 30, jealousy: 20, protectiveness: 30, emotionalDistance: 50, attachment: 30,
  stage: 'friend', unresolvedEventIds: [], updatedAt: new Date(), ...over,
})
const personality = { jealousy: 50, emotionalExpression: 50 }

describe('semantic events → rules → delta', () => {
  it('classifies a sentence into typed events with confidence', () => {
    const ev = detectSemanticEvents('오늘 다른 남자랑 술 마셨어')
    expect(ev.map((e) => e.type)).toEqual(expect.arrayContaining(['mentioned_other_romantic_interest', 'drank_with_someone']))
    expect(ev[0]!.confidence).toBeGreaterThanOrEqual(0.8)
  })
  it('an apology cancels hostility detected in the same sentence', () => {
    expect(detectSemanticEvents('짜증 나서 그랬어, 미안').map((e) => e.type)).toEqual(['apologized'])
  })
  it('the code decides the delta from events, not the model', () => {
    const d = deltaFromSemanticEvents(detectSemanticEvents('오늘 다른 남자랑 술 마셨어'), personality)
    expect(d.jealousy).toBeGreaterThanOrEqual(14)
    expect(d.trust).toBeLessThan(0)
  })
  it('a plain sentence only decays jealousy', () => {
    expect(deltaFromSemanticEvents([], personality)).toEqual({ jealousy: -2 })
  })
  it('the model may only add nuance within ±LLM_NUANCE_LIMIT', () => {
    const merged = mergeRelationshipDelta({ jealousy: 12 }, { jealousy: 40, trust: -50, stage: 'conflict' })
    expect(merged.jealousy).toBe(12 + LLM_NUANCE_LIMIT)
    expect(merged.trust).toBe(-LLM_NUANCE_LIMIT)
    expect(merged.stage).toBe('conflict')
  })
  it('merges two classifiers keeping the higher confidence', () => {
    expect(mergeSemanticEvents([{ type: 'compliment', confidence: 0.5 }], [{ type: 'compliment', confidence: 0.9 }, { type: 'lied', confidence: 0.7 }]))
      .toEqual([{ type: 'compliment', confidence: 0.9 }, { type: 'lied', confidence: 0.7 }])
  })
})

describe('character state', () => {
  it('turns jealous when the user mentions someone else, and calmer after an apology', () => {
    const jealous = deriveCharacterState(DEFAULT_CHARACTER_STATE, rel({ jealousy: 40 }), detectSemanticEvents('소개팅 나갔다 왔어'))
    expect(jealous.mood).toBe('jealous')
    expect(jealous.currentGoals[0]).toContain('누구')
    const calmer = deriveCharacterState(jealous, rel({ jealousy: 30 }), detectSemanticEvents('미안, 보고 싶었어'))
    expect(calmer.stress).toBeLessThan(jealous.stress)
    expect(calmer.mood).toBe('happy')
  })
})

describe('memory retrieval', () => {
  const mem = (content: string, type: 'user_fact' | 'conflict', importance = 0.5) => ({ sessionId: 's', characterId: 'c', content, type, importance, persistence: 0.5 })
  it('prefers memories that share words with the current message, but keeps important ones', () => {
    const picked = retrieveMemories([mem('사용자는 커피를 좋아한다', 'user_fact', 0.3), mem('사용자의 생일은 3월 2일', 'user_fact', 0.9), mem('지난주 큰 싸움', 'conflict', 0.4)], 's', 2, '커피 마실래?')
    expect(picked.map((m) => m.content)).toEqual(['사용자는 커피를 좋아한다', '사용자의 생일은 3월 2일'])
  })
  it('splits memories into long-term and relationship layers', () => {
    const g = groupByLayer([mem('a', 'user_fact'), mem('b', 'conflict')])
    expect(g.long_term).toHaveLength(1); expect(g.relationship).toHaveLength(1)
  })
})

describe('event rules', () => {
  it('fires jealousy_spike once, in-turn, with zero delay', () => {
    const c = { relationship: rel({ jealousy: 60 }), characterState: DEFAULT_CHARACTER_STATE, semanticEvents: detectSemanticEvents('다른 남자랑 술 마셨어'), idleMinutes: 0, turnCount: 3 }
    const fired = evaluateEventRules(c)
    expect(fired.map((r) => r.id)).toContain('jealousy_spike')
    expect(fired.find((r) => r.id === 'jealousy_spike')!.effect.realityIntent!.delayMinutes).toBe(0)
    expect(evaluateEventRules({ ...c, characterState: { ...DEFAULT_CHARACTER_STATE, firedRules: ['jealousy_spike'] } }).map((r) => r.id)).not.toContain('jealousy_spike')
  })
  it('jealous_follow_up waits for silence and carries a delay for the scheduler', () => {
    const base = { relationship: rel({ jealousy: 80 }), characterState: DEFAULT_CHARACTER_STATE, semanticEvents: [], turnCount: 5 }
    expect(evaluateEventRules({ ...base, idleMinutes: 5 }).map((r) => r.id)).not.toContain('jealous_follow_up')
    const fired = evaluateEventRules({ ...base, idleMinutes: 45 }).find((r) => r.id === 'jealous_follow_up')
    expect(fired?.effect.realityIntent?.delayMinutes).toBe(37)
  })
})
