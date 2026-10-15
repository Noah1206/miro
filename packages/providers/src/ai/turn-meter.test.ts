import { describe, expect, it } from 'vitest'
import { TurnMeter } from './turn-meter'
import { ModelRegistry } from './model-registry'
import { AIOrchestrator } from './orchestrator'
import type { AIUsageRecord } from './types'
const model = new ModelRegistry([{ id: 'm', provider: 'openai', providerModelId: 'm', tier: 'standard', capabilities: ['dialogue'], inputCost: 1, outputCost: 2, maxContextTokens: 100000, maxOutputTokens: 2000 }]).models[0]!
const request = { task: 'dialogue', system: '', prompt: 'hello', maxTokens: 1000 }
const record = (cost: number | null, ok = true) => ({ estimatedCost: cost, ok } as AIUsageRecord)
describe('shared turn cost envelope', () => {
  it('reserves synchronously across concurrent analyses, then releases the unused estimate', () => {
    const meter = new TurnMeter(.003, 10000, 1000)
    const first = meter.reserve(request, model)!
    expect(first).toBeTruthy()
    expect(meter.reserve(request, model)).toBeNull()
    first.settle(record(.0001))
    expect(meter.customerCostUSD).toBe(.0001)
    expect(meter.reserve(request, model)).toBeTruthy()
  })
  it('does not bill unreported failures as measured usage; unknown successful usage blocks settlement', () => {
    const meter = new TurnMeter(.02, 10000, 1000)
    meter.reserve(request, model)!.settle(record(null, false))
    expect(meter.customerCostUSD).toBe(0)
    expect(meter.missingSuccessfulUsage).toBe(false)
    meter.reserve(request, model)!.settle(record(null))
    expect(meter.missingSuccessfulUsage).toBe(true)
  })
  it('rejects oversized input and all further calls once the delivered turn is closed', () => {
    const meter = new TurnMeter(.1, 1000, 1000)
    expect(meter.reserve({ ...request, prompt: '가'.repeat(200) }, model)).toBeNull()
    meter.closed = true
    expect(meter.reserve(request, model)).toBeNull()
  })
  it('allows recovery after unreported provider failures while retaining the measured aggregate ceiling', () => {
    const meter = new TurnMeter(.003, 10000, 1000)
    for (let attempt = 0; attempt < 3; attempt++) {
      const ticket = meter.reserve(request, model)
      expect(ticket).not.toBeNull()
      ticket!.settle(record(null, false))
    }
    meter.reserve(request, model)!.settle(record(.002))
    expect(meter.customerCostUSD).toBe(.002)
    expect(meter.reserve(request, model)).toBeNull()
  })
  it('enforces output and aggregate cost in the actual orchestrator before invoking the provider', async () => {
    const calls: number[] = []
    const provider = { info: { mode: 'live' as const, name: 'test', notice: null }, healthCheck: async () => true,
      generate: async (r: { maxTokens?: number }) => { calls.push(r.maxTokens!); return { text: 'ok', provider: 'openai', model: 'm', inputTokens: 10, outputTokens: 100, latencyMs: 1 } } }
    const meter = new TurnMeter(.001, 10000, 200)
    const ai = new AIOrchestrator({ chain: [provider], explicitModel: model, context: { turnMeter: meter }, maxRetries: 0 })
    expect(await ai.generateText({ ...request, maxTokens: 9000 })).toBe('ok')
    expect(calls).toEqual([200])
    expect(meter.customerCostUSD).toBeCloseTo(.00021)
    await expect(ai.generateText({ ...request, maxTokens: 9000 })).rejects.toThrow('turn_tokens')
    expect(calls).toHaveLength(1)
  })
})
