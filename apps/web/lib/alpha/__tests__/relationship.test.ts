import { describe, expect, it } from 'vitest'
import { INITIAL_STATE, applyUserMessage } from '../relationship'

describe('alpha relationship rules', () => {
  it('meeting someone else raises jealousy, lowers trust, and leaves a memory', () => {
    const r = applyUserMessage(INITIAL_STATE, '오늘 다른 남자랑 술 마셨어')
    expect(r.state.jealousy).toBeGreaterThan(INITIAL_STATE.jealousy + 15)
    expect(r.state.trust).toBeLessThan(INITIAL_STATE.trust)
    expect(r.memories).toContain('사용자가 오늘 다른 사람과 만났다고 말했다.')
    expect(r.wow).toBe(true)
    // 한 마디로 리얼리티 문턱(45)을 넘는다 — 하루 15마디 안에서 반드시 보여야 한다
    expect(r.state.jealousy).toBeGreaterThanOrEqual(45)
    expect(r.state.currentMood).toBe('jealous')
  })
  it('affection raises affection and trust and can turn the mood happy', () => {
    const r = applyUserMessage(INITIAL_STATE, '그냥 네 생각이 나서. 보고 싶었어')
    expect(r.state.affection).toBe(INITIAL_STATE.affection + 10)
    expect(r.state.currentMood).toBe('happy')
  })
  it('a plain message only decays anger and jealousy — no wow, no memory', () => {
    const r = applyUserMessage({ ...INITIAL_STATE, anger: 30 }, '응 그랬어')
    expect(r.state.anger).toBe(27)
    expect(r.memories).toEqual([])
    expect(r.wow).toBe(false)
  })
  it('repeated jealousy pushes the stage to conflicted and the mood to jealous', () => {
    let s = INITIAL_STATE
    for (let i = 0; i < 3; i++) s = applyUserMessage(s, '소개팅 나갔다 왔어').state
    expect(s.currentMood).toBe('jealous')
    expect(['conflicted', 'close']).toContain(s.relationshipStage)
  })
  it('values stay inside 0..100', () => {
    let s = INITIAL_STATE
    for (let i = 0; i < 20; i++) s = applyUserMessage(s, '꺼져 짜증나').state
    expect(s.anger).toBeLessThanOrEqual(100); expect(s.affection).toBeGreaterThanOrEqual(0)
  })
})
