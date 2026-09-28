import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelRegistry, AIOrchestrator } from '@miro/providers'
import { POLICY } from '@miro/config'
import { chatModelOptions, resolveChatModel } from '../chat-models'
const plan = vi.hoisted(() => vi.fn(async () => 'free'))
vi.mock('@/lib/usage/guard', () => ({ effectivePlan: plan }))
const models = [
  { id: 'basic', provider: 'mock', providerModelId: 'basic', tier: 'small', capabilities: ['dialogue'], maxContextTokens: 32768 },
  { id: 'advanced', provider: 'mock', providerModelId: 'advanced', tier: 'premium', capabilities: ['dialogue'], maxContextTokens: 32768 },
]
beforeEach(() => { plan.mockResolvedValue('free'); vi.stubEnv('MIRO_MODEL_REGISTRY', JSON.stringify(models)); vi.stubEnv('MIRO_CHAT_MODEL_ID', '') })
afterEach(() => vi.unstubAllEnvs())
describe('plan-based chat models', () => {
  it('serves MIRO and ECHO from the same model', async () => {
    plan.mockResolvedValue('pro')
    const miro = await resolveChatModel('u', 'miro')
    const echo = await resolveChatModel('u', 'pro')
    expect(echo.modelId).toBe(miro.modelId)
  })
  it('separates the two by what each turn spends, not by the backend', async () => {
    plan.mockResolvedValue('pro')
    const miro = await resolveChatModel('u', 'miro')
    const echo = await resolveChatModel('u', 'pro')
    expect(miro.metered).toBe(false)
    expect(echo.metered).toBe(true)
    // ECHO 는 같은 모델에 더 들인다 — 맥락도, 응답 길이도, 보조 분석도.
    expect(echo.tier.contextScale).toBeGreaterThan(miro.tier.contextScale)
    expect(echo.tier.maxOutputTokens).toBeGreaterThan(miro.tier.maxOutputTokens)
    expect(echo.tier.auxiliary).toBe('always')
    // 상한만 올리면 모델은 지시대로 500~900자에 멈춘다 — 긴 장면은 지시가 정한다.
    expect(echo.tier.replyLength).toBe('long')
    expect(miro.tier.replyLength).toBe('scene')
    expect(miro.tier.auxiliary).toBe('planned')
  })
  it('honours a pinned model id for both', async () => {
    plan.mockResolvedValue('pro')
    vi.stubEnv('MIRO_CHAT_MODEL_ID', 'advanced')
    expect((await resolveChatModel('u', 'miro')).modelId).toBe('advanced')
    expect((await resolveChatModel('u', 'pro')).modelId).toBe('advanced')
  })
  it('rejects forged Pro choices for Free accounts and arbitrary IDs', async () => {
    await expect(resolveChatModel('u', 'pro')).rejects.toThrow('pro required')
    await expect(resolveChatModel('u', 'advanced')).rejects.toThrow('invalid')
  })
  it('never lets an unknown choice pass itself off as unmetered chat', async () => {
    for (const forged of ['echo', 'MIRO', 'free', '']) await expect(resolveChatModel('u', forged)).rejects.toThrow('invalid')
  })
  it('both are ready together, and neither without a dialogue model', async () => {
    expect(await chatModelOptions('u')).toEqual({ freeReady: true, proReady: true, isPro: false })
    vi.stubEnv('MIRO_MODEL_REGISTRY', JSON.stringify([{ ...models[0], capabilities: ['image_prompt'] }]))
    expect(await chatModelOptions('u')).toEqual({ freeReady: false, proReady: false, isPro: false })
  })
  it('routes dialogue to the selected model rather than another tier', async () => {
    const registry = new ModelRegistry(models)
    const calls: string[] = []
    const provider = (id: string) => ({ info: { mode: 'mock' as const, name: id, notice: null }, healthCheck: async () => true,
      generate: async () => { calls.push(id); return { text: '안녕', provider: 'mock', model: id, inputTokens: 1, outputTokens: 1, latencyMs: 1 } } })
    for (const id of ['basic', 'advanced']) {
      const ai = new AIOrchestrator({ chain: [provider('basic')], registry, resolveModel: m => provider(m.id), context: { dialogueModelId: id } })
      expect(await ai.generateText({ task: 'dialogue', system: '', prompt: '안녕' })).toBe('안녕')
    }
    expect(calls).toEqual(['basic', 'advanced'])
  })
  it('keeps the tiers as policy values rather than hardcoded numbers', () => {
    expect(POLICY.chatTier.miro.contextScale).toBe(1)
    expect(POLICY.chatTier.echo.contextScale).toBeGreaterThan(1)
  })
})
