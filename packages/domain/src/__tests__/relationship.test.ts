import { describe, expect, it } from 'vitest'
import { applyRelationshipDelta, modulateByPersonality } from '../relationship/apply'
import type { RelationshipState } from '../relationship/types'

function state(over: Partial<RelationshipState> = {}): RelationshipState {
  return {
    id: 'r1', sessionId: 's1', version: 1,
    trust: 50, attraction: 50, jealousy: 20,
    protectiveness: 30, emotionalDistance: 40, attachment: 45,
    stage: 'friend', unresolvedEventIds: [], updatedAt: new Date(),
    ...over,
  }
}

describe('relationship delta', () => {
  it('clamps absurd AI deltas (trust +10000 must not apply)', () => {
    const next = applyRelationshipDelta(state({ trust: 50 }), { trust: 10000 })
    expect(next.trust).toBe(65) // 50 + clamp(10000, ±15)
  })

  it('T3: regression — trust drops after betrayal even from a high baseline', () => {
    const next = applyRelationshipDelta(state({ trust: 95 }), { trust: -15 })
    expect(next.trust).toBe(80)
    expect(next.trust).toBeLessThan(95)
  })

  it('past high values do not cancel out current conflict', () => {
    let s = state({ trust: 20 })
    // 과거에 높았던 이력이 있어도 현재 delta 는 그대로 적용된다
    s = applyRelationshipDelta(s, { trust: -10 })
    expect(s.trust).toBe(10)
  })

  it('stays within [0,100]', () => {
    expect(applyRelationshipDelta(state({ trust: 3 }), { trust: -15 }).trust).toBe(0)
    expect(applyRelationshipDelta(state({ trust: 98 }), { trust: 15 }).trust).toBe(100)
  })

  it('bumps version for optimistic locking', () => {
    expect(applyRelationshipDelta(state({ version: 7 }), { trust: 1 }).version).toBe(8)
  })

  it('T2: same delta yields different results per personality', () => {
    const jealous = modulateByPersonality({ jealousy: 10 }, { jealousy: 100, emotionalExpression: 50 })
    const calm = modulateByPersonality({ jealousy: 10 }, { jealousy: 0, emotionalExpression: 50 })
    expect(jealous.jealousy).toBeGreaterThan(calm.jealousy!)
  })
})
