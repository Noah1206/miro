import { afterEach, describe, expect, it, vi } from 'vitest'
import { adultDialogueFallbacks } from '../adult-fallback'

/**
 * 11/22 언베일 방에서 고른 모델이 거절하면 다른 언베일 모델로 그 턴만 폴백한다.
 * 폴백 후보 순서: 거절한 모델을 빼고, 예비(fallback)를 먼저, 그다음 선택 가능한 것. env(레지스트리)가 순서를 정한다.
 */
describe('adult dialogue fallback candidates', () => {
  afterEach(() => { vi.unstubAllEnvs() })
  const reg = (models: object[]) => { vi.stubEnv('MIRO_ADULT_MODEL_REGISTRY', JSON.stringify(models)); vi.stubEnv('OPENROUTER_API_KEY', 'k') }
  const M = (id: string, extra: object = {}) => ({ id, provider: 'openrouter', providerModelId: id, tier: 'standard', capabilities: ['dialogue'], inputCost: 1, outputCost: 1, maxContextTokens: 128000, maxOutputTokens: 8192, ...extra })

  it('drops the blocked model and ranks fallback models first, then chat-selectable', () => {
    reg([M('gpt', { chatSelectable: true }), M('deepseek', { fallback: true }), M('grok', { chatSelectable: true })])
    // gpt 가 거절 → 후보에서 gpt 를 빼고 예비(deepseek)를 맨 앞에.
    expect(adultDialogueFallbacks('gpt')).toEqual(['deepseek', 'grok'])
  })

  it('returns nothing when the blocked model is the only usable one (no bypass, no loop)', () => {
    reg([M('solo', { chatSelectable: true })])
    expect(adultDialogueFallbacks('solo')).toEqual([])
  })

  it('is empty when no adult registry is configured', () => {
    vi.stubEnv('MIRO_ADULT_MODEL_REGISTRY', ''); vi.stubEnv('OPENROUTER_API_KEY', '')
    expect(adultDialogueFallbacks('gpt')).toEqual([])
  })
})
