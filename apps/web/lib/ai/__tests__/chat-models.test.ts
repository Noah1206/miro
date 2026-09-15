import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelRegistry, AIOrchestrator } from '@miro/providers'
import { chatModelOptions, resolveChatModel } from '../chat-models'
const plan = vi.hoisted(() => vi.fn(async () => 'free'))
vi.mock('@/lib/usage/guard', () => ({ effectivePlan: plan }))
const models = [
  { id: 'basic', provider: 'mock', providerModelId: 'basic', tier: 'small', capabilities: ['dialogue'], maxContextTokens: 32768 },
  { id: 'advanced', provider: 'mock', providerModelId: 'advanced', tier: 'premium', capabilities: ['dialogue'], maxContextTokens: 32768 },
]
beforeEach(() => { plan.mockResolvedValue('free'); vi.stubEnv('MIRO_MODEL_REGISTRY', JSON.stringify(models)); vi.stubEnv('MIRO_CHAT_FREE_MODEL_ID', ''); vi.stubEnv('MIRO_CHAT_PRO_MODEL_ID', '') })
afterEach(() => vi.unstubAllEnvs())
describe('plan-based chat models', () => {
  it('defaults to a basic model even for Pro subscribers', async () => {
    plan.mockResolvedValue('pro')
    expect(await resolveChatModel('u', 'miro')).toEqual({ modelId: 'basic', metered: false })
    expect(await resolveChatModel('u', 'pro')).toEqual({ modelId: 'advanced', metered: true })
  })
  it('rejects forged Pro choices for Free accounts and arbitrary IDs', async () => {
    await expect(resolveChatModel('u', 'pro')).rejects.toThrow('pro required')
    await expect(resolveChatModel('u', 'advanced')).rejects.toThrow('invalid')
  })
  it('never lets an unknown choice pass itself off as unmetered chat', async () => {
    for (const forged of ['echo', 'MIRO', 'free', '']) await expect(resolveChatModel('u', forged)).rejects.toThrow('invalid')
  })
  it('does not present the same backend as two different models', async () => {
    vi.stubEnv('MIRO_CHAT_PRO_MODEL_ID', 'basic')
    expect((await chatModelOptions('u')).proReady).toBe(false)
  })
  it('marks an unconfigured Pro model unavailable', async () => {
    vi.stubEnv('MIRO_MODEL_REGISTRY', JSON.stringify([models[0]]))
    expect(await chatModelOptions('u')).toEqual({ freeReady: true, proReady: false, isPro: false })
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
})
