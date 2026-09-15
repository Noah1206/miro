import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { devApiAllowed, mockProvidersAllowed, feature } from '@miro/config'
import { registryFromEnv } from '../ai/resolve'
import { validationBudget } from '../../../../tooling/validation-budget'
import { ModelRegistry } from '../ai/model-registry'
import { AIOrchestrator } from '../ai/orchestrator'
import { AIContentBlockedError } from '../ai/types'

afterEach(() => vi.unstubAllEnvs())
describe('production gates and validation spending', () => {
  it('records a provider safety block and never retries or uses another model', async () => {
    const generate = vi.fn(async () => ({ blocked: true, text: '', provider: 'gemini', model: 'test', inputTokens: 20, outputTokens: null, latencyMs: 1 }))
    const onUsage = vi.fn()
    const provider = { info: { mode: 'live' as const, name: 'test', notice: null }, generate, healthCheck: async () => true }
    const ai = new AIOrchestrator({ chain: [provider, provider], maxRetries: 1, onUsage })
    await expect(ai.generateText({ system: '', prompt: 'test' })).rejects.toBeInstanceOf(AIContentBlockedError)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: 'content_blocked', inputTokens: 20 }))
  })
  it('does not allow env flags to reopen production mocks or unfinished media', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('MIRO_ENABLE_DEV_API', '1')
    vi.stubEnv('MIRO_TEST_MODE', '1'); vi.stubEnv('DATABASE_URL', 'postgres://remote/miro')
    vi.stubEnv('MIRO_FEATURE_VOICE_CALL', '1')
    expect(devApiAllowed()).toBe(false); expect(mockProvidersAllowed()).toBe(false); expect(feature('voiceCall')).toBe(false)
    vi.stubEnv('MIRO_MODEL_REGISTRY', ''); vi.stubEnv('AI_PROVIDER', ''); vi.stubEnv('AI_FALLBACK_PROVIDER', '')
    expect(() => registryFromEnv(() => null)).toThrow()
  })
  it('permits isolated production-mode E2E but never Vercel production', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('MIRO_TEST_MODE', '1'); vi.stubEnv('DATABASE_URL', 'postgres://localhost/miro_test')
    expect(mockProvidersAllowed()).toBe(true)
    vi.stubEnv('VERCEL_ENV', 'production'); expect(mockProvidersAllowed()).toBe(false)
  })
  it('keeps cumulative reservations across restarts and refuses a second writer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'miro-budget-test-'))
    const path = join(dir, 'ledger.json')
    const model = new ModelRegistry([{ id: 'test', provider: 'gemini', providerModelId: 'gemini-2.5-flash-lite', tier: 'small', capabilities: ['dialogue'], maxContextTokens: 4096, inputCost: .1, outputCost: .4 }]).models[0]!
    try {
      const first = await validationBudget(path, .01)
      await expect(validationBudget(path, .01)).rejects.toThrow()
      expect((await first.guard.authorize({ task: 'dialogue', system: '', prompt: 'hi', maxTokens: 2 }, model, {}, 'one')).allowed).toBe(true)
      await first.close()
      const second = await validationBudget(path, .01)
      expect((await second.guard.authorize({ task: 'dialogue', system: '', prompt: 'hi', maxTokens: 2 }, model, {}, 'two')).allowed).toBe(false)
      await second.close()
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
