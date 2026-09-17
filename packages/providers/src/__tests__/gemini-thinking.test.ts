import { describe, expect, it } from 'vitest'
import { thinkingConfig } from '../ai/gemini'

/**
 * 2026-09 실측. 틀린 값은 400 으로 턴 전체가 죽고, 빠뜨리면 턴마다 생각 토큰 700~1,100개가 출력 단가로 나간다.
 *   3.8-flash  : minimal → 400, low → 생각 0
 *   3.5-flash  : low → 여전히 716, budget 0 → 생각 0
 *   3.1-pro    : budget 0 → 400 ("only works in thinking mode"), low → ≈630
 */
describe('gemini thinking config', () => {
  it('sends the one setting each model accepts', () => {
    expect(thinkingConfig('gemini-3.5-flash-lite')).toEqual({ thinkingConfig: { thinkingLevel: 'minimal' } })
    expect(thinkingConfig('gemini-3.5-flash')).toEqual({ thinkingConfig: { thinkingBudget: 0 } })
    expect(thinkingConfig('gemini-3.8-flash')).toEqual({ thinkingConfig: { thinkingLevel: 'low' } })
    expect(thinkingConfig('gemini-3.1-pro-preview')).toEqual({ thinkingConfig: { thinkingLevel: 'low' } })
    expect(thinkingConfig('gemini-2.5-flash')).toEqual({ thinkingConfig: { thinkingBudget: 0 } })
  })
  it('sends nothing for a model it has not measured', () => {
    expect(thinkingConfig('gemini-4.0-something')).toEqual({})
  })
})
