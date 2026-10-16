import { afterEach, describe, expect, it, vi } from 'vitest'
import definitions from '../../../../ai/models/miro-role-split.json'
import { AIOrchestrator, type OrchestratorOptions } from '../ai/orchestrator'
import { ModelRegistry } from '../ai/model-registry'
import { createAI } from '../ai/resolve'
import { TurnMeter } from '../ai/turn-meter'
import { GeminiProvider } from '../ai/gemini'
import { AnthropicProvider } from '../ai/anthropic'
import type { AIUsageRecord, GenerationRequest } from '../ai/types'

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
const request = { system: 'system', prompt: 'input', task: 'agency_verify', maxTokens: 1536 }
function setup(over: Partial<OrchestratorOptions> = {}, registry = new ModelRegistry(definitions)) {
  const calls: Array<{ id: string; request: GenerationRequest }> = [], usage: AIUsageRecord[] = []
  const provider = (id: string) => ({ info: { mode: 'live' as const, name: `recorded/${id}`, notice: 'No network' }, healthCheck: async () => true,
    generate: async (r: GenerationRequest) => { calls.push({ id, request: r }); return { text: 'ok', provider: 'recorded', model: id, inputTokens: 10, outputTokens: 5, latencyMs: 1 } } })
  return { calls, usage, ai: new AIOrchestrator({ chain: [provider('gemini-flash')], registry, resolveModel: m => provider(m.id),
    taskModels: { agency_verify: 'claude-sonnet' }, onUsage: item => { usage.push(item) }, maxRetries: 0, ...over }) }
}

describe('server-pinned task model', () => {
  it('pins verification only and preserves Gemini dialogue, planning and memory roles', async () => {
    const { ai, calls, usage } = setup()
    for (const task of ['dialogue', 'agency_plan', 'memory_extraction', 'memory_summary', 'agency_verify']) await ai.generateText({ ...request, task })
    expect(calls.map(c => c.id)).toEqual(['gemini-flash', 'gemini-flash', 'gemini-flash-lite', 'gemini-flash-lite', 'claude-sonnet'])
    expect(ai.lastModelId).toBe('claude-sonnet')
    expect(usage.at(-1)).toMatchObject({ task: 'agency_verify', modelId: 'claude-sonnet', fallbackUsed: false })
    expect(calls.at(-1)!.request.disableProviderFallback).toBe(true)
    expect(calls.slice(0, -1).every(c => !c.request.disableProviderFallback)).toBe(true)
  })

  it('keeps the previous route when there is no server override and ignores request-level model data', async () => {
    const previous = setup({ taskModels: undefined })
    await previous.ai.generateText(request)
    expect(previous.calls[0]!.id).toBe('gemini-flash')
    const pinned = setup()
    const untrusted = { ...request, taskModels: { agency_verify: 'gemini-flash' }, modelId: 'gemini-flash' }
    await pinned.ai.generateText(untrusted)
    expect(pinned.calls[0]!.id).toBe('claude-sonnet')
  })

  it.each(['missing', 'disabled', 'incapable', 'small_context', 'continuity'] as const)('fails closed for %s without calling Gemini', async reason => {
    const registry = new ModelRegistry(definitions.map(m => m.id !== 'claude-sonnet' ? m : { ...m,
      ...(reason === 'disabled' ? { enabled: false } : {}),
      ...(reason === 'incapable' ? { capabilities: ['memory_summary'] } : {}),
      ...(reason === 'small_context' ? { maxContextTokens: 1000 } : {}),
    }))
    const { ai, calls } = setup({ taskModels: { agency_verify: reason === 'missing' ? 'missing-model' : 'claude-sonnet' },
      ...(reason === 'continuity' ? { context: { continuity: true } } : {}) }, registry)
    await expect(ai.generateText(request)).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('counts response schema bytes when validating a pinned model context', async () => {
    const registry = new ModelRegistry(definitions.map(m => m.id !== 'claude-sonnet' ? m : { ...m, maxContextTokens: 2100 }))
    const { ai, calls } = setup({}, registry)
    const input = { ...request, responseSchema: { description: 'x'.repeat(200) } }
    await expect(ai.generateText(input)).rejects.toThrow('cannot fit context')
    expect(calls).toEqual([])
  })

  it('does not switch providers after the pinned verifier fails', async () => {
    const generated = vi.fn(async () => { throw new Error('provider_http_401') })
    const { ai } = setup({ resolveModel: model => {
      expect(model.id).toBe('claude-sonnet')
      return { info: { mode: 'live', name: 'unavailable-verifier', notice: null }, generate: generated, healthCheck: async () => true }
    } })
    await expect(ai.generateText(request)).rejects.toMatchObject({ attempts: 1, last: 'provider_http_401' })
    expect(generated).toHaveBeenCalledTimes(1)
  })

  it('preserves the original output cap, shared meter and measured usage', async () => {
    const meter = new TurnMeter(.01, 10000, 200)
    const { ai, calls, usage } = setup({ context: { turnMeter: meter } })
    await ai.generateText(request)
    expect(calls[0]!.request).toMatchObject({ maxTokens: 200, hardTokenCap: true })
    expect(meter.customerCostUSD).toBeCloseTo(.00007)
    expect(usage[0]).toMatchObject({ inputTokens: 10, outputTokens: 5, modelId: 'claude-sonnet' })
  })

  it('records the actual returned provider model separately from the configured alias', async () => {
    const { ai, usage } = setup({ resolveModel: () => ({ info: { mode: 'live', name: 'configured-alias', notice: null }, healthCheck: async () => true,
      generate: async r => {
        expect(r.disableProviderFallback).toBe(true)
        return { text: 'ok', provider: 'anthropic', model: 'actual-returned-version', inputTokens: 10, outputTokens: 5, latencyMs: 1 }
      },
    }) })
    await ai.generateText(request)
    expect(usage[0]).toMatchObject({ provider: 'anthropic', model: 'actual-returned-version', modelId: 'claude-sonnet', fallbackUsed: false })
  })

  it.each(['turn_cost', 'input', 'service_budget'] as const)('enforces unchanged %s before calling the pinned provider', async boundary => {
    const meter = new TurnMeter(boundary === 'turn_cost' ? .00001 : .1, boundary === 'input' ? 520 : 10000, 2048)
    const { ai, calls } = setup({ context: { turnMeter: meter }, ...(boundary === 'service_budget' ? {
      budgetGuard: { authorize: async () => ({ allowed: false as const, reason: 'global_cost' }) },
    } : {}) })
    await expect(ai.generateText(request)).rejects.toThrow('AI budget denied')
    expect(calls).toEqual([])
  })
})

describe('shared createAI task configuration', () => {
  function configure(pin: string) {
    vi.stubEnv('MIRO_MODEL_REGISTRY', JSON.stringify(definitions))
    vi.stubEnv('GEMINI_API_KEY', 'fixture-key'); vi.stubEnv('ANTHROPIC_API_KEY', 'fixture-key')
    vi.stubEnv('MIRO_AGENCY_VERIFY_MODEL_ID', pin)
    vi.stubEnv('MIRO_SHADOW_MODEL', ''); vi.stubEnv('MIRO_CANARY_MODEL', '')
  }
  it('injects only the operator environment override into the common resolver', async () => {
    configure('claude-sonnet')
    const result = { text: 'ok', inputTokens: 10, outputTokens: 5, latencyMs: 1 }
    const gemini = vi.spyOn(GeminiProvider.prototype, 'generate').mockResolvedValue({ ...result, provider: 'gemini', model: 'fixture-gemini' })
    const sonnet = vi.spyOn(AnthropicProvider.prototype, 'generate').mockResolvedValue({ ...result, provider: 'anthropic', model: 'fixture-sonnet' })
    const ai = createAI({ mock: () => 'must not be used' })
    for (const task of ['dialogue', 'agency_plan', 'memory_extraction', 'agency_verify']) await ai.generateText({ ...request, task })
    expect(gemini.mock.calls.map(([r]) => r.task)).toEqual(['dialogue', 'agency_plan', 'memory_extraction'])
    expect(sonnet.mock.calls.map(([r]) => r.task)).toEqual(['agency_verify'])
  })

  it('leaves verification on Gemini when the environment override is unset', async () => {
    configure('')
    const gemini = vi.spyOn(GeminiProvider.prototype, 'generate').mockResolvedValue({ text: 'ok', provider: 'gemini', model: 'fixture-gemini', inputTokens: 10, outputTokens: 5, latencyMs: 1 })
    const sonnet = vi.spyOn(AnthropicProvider.prototype, 'generate')
    await createAI({ mock: () => 'must not be used' }).generateText(request)
    expect(gemini).toHaveBeenCalledTimes(1)
    expect(sonnet).not.toHaveBeenCalled()
  })

  it('fails a missing configured verifier without falling back when its credentials are absent', async () => {
    configure('claude-sonnet'); vi.stubEnv('ANTHROPIC_API_KEY', ''); vi.stubEnv('OPENAI_API_KEY', '')
    const gemini = vi.spyOn(GeminiProvider.prototype, 'generate')
    const ai = createAI({ mock: () => 'must not be used' })
    await expect(ai.generateText(request)).rejects.toThrow('model unavailable: claude-sonnet')
    expect(gemini).not.toHaveBeenCalled()
  })
})
