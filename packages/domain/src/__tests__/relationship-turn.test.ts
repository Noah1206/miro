import { describe, expect, it } from 'vitest'
import { detectSemanticEvents, relationshipTurn } from '../index'
import { character, relationship } from '../../../engine/src/__tests__/fixtures'

describe('relationshipTurn — 관계가 한 턴의 사건에 스스로 반응한다', () => {
  it('reproduces the 강태준 replay: a blind-date mention raises jealousy 8, keeps the stage, and makes him jealous', () => {
    const 강태준 = character({ jealousy: 45, emotionalExpression: 40, initiative: 70 })
    const start = relationship({ trust: 38, attraction: 8, jealousy: 0, protectiveness: 10, emotionalDistance: 57, attachment: 11, stage: 'acquaintance' })
    const input = '나 어제 소개팅 갔다 왔어'
    const r = relationshipTurn({ character: 강태준, relationship: start, events: detectSemanticEvents(input), turn: 5, userInput: input })
    expect([r.relationship.trust, r.relationship.jealousy, r.relationship.emotionalDistance, r.relationship.attachment]).toEqual([37, 8, 58, 12])
    expect(r.delta.stage).toBe('acquaintance')
    expect(r.relationship.stage).toBe('acquaintance')
    expect(r.characterState.mood).toBe('jealous')
    expect(start.jealousy).toBe(0)   // 입력 관계는 건드리지 않는다
  })
})
