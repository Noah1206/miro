import { describe, expect, it } from 'vitest'
import { nextRelationshipStage, detectSemanticEvents, applyRelationshipDelta, deltaFromSemanticEvents } from '../index'
import { character, relationship } from '../../../engine/src/__tests__/fixtures'
describe('relationship stages', () => {
  it('develops beyond stranger while repeated confessions never create a dating relationship', () => {
    let state = relationship()
    for (let turn = 1; turn <= 30; turn++) {
      const events = detectSemanticEvents('사랑해')
      const projected = applyRelationshipDelta(state, deltaFromSemanticEvents(events, character().personality))
      projected.stage = nextRelationshipStage(state.stage, projected, events, turn)
      state = projected
    }
    expect(state.stage).not.toBe('stranger')
    expect(['dating', 'lover']).not.toContain(state.stage)
  })
  it('respects rejection even at maximum affinity', () => {
    expect(nextRelationshipStage('lover', relationship({ trust: 100, attachment: 100 }), detectSemanticEvents('우리 그만 만나'), 50)).toBe('distrust')
  })
  it.each(['친구가 "사랑해"라고 말했어', '사랑한다고 말한 적 없어', '커피를 좋아해', '사랑하지 않아', '사랑해라는 대사를 적어줘'])('does not interpret %s as a confession', text => {
    expect(detectSemanticEvents(text).map(e => e.type)).not.toContain('confession')
  })
})
