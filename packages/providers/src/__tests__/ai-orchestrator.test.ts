import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { AIOrchestrator, AIUnavailableError } from '../ai/orchestrator'
import { ModelRegistry } from '../ai/model-registry'
import type { AIProvider, AIUsageRecord, GenerationRequest } from '../ai/types'
import { resolveAIChain } from '../ai/resolve'

const saved = { ...process.env }
afterEach(() => { process.env = { ...saved } })

function fake(name: string, answers: Array<string | Error>): AIProvider {
  let i = 0
  return {
    info: { mode: 'live', name, notice: null },
    async healthCheck() { return true },
    async generate(_req: GenerationRequest) {
      const a = answers[Math.min(i++, answers.length - 1)]!
      if (a instanceof Error) throw a
      return { text: a, provider: name, model: name, inputTokens: 10, outputTokens: 5, latencyMs: 1 }
    },
  }
}
const Schema = z.object({ message: z.string() })

describe('AIOrchestrator', () => {
  it('keeps the production budget path available when DB leases are disabled', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.MIRO_AI_DB_LEASES = '0'
    const provider = fake('production-test', ['ok'])
    const ai = new AIOrchestrator({ chain: [provider], budgetGuard: {
      authorize: async () => ({ allowed: true, reservationId: 'test', maxUsageUnits: 0 }),
    } })
    await expect(ai.generateText({ system: '', prompt: '' })).resolves.toBe('ok')
  })
  it('fails closed in production when DB leases are enabled without an installed guard', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.MIRO_AI_DB_LEASES = '1'
    const provider = fake('production-test', ['ok'])
    const ai = new AIOrchestrator({ chain: [provider], budgetGuard: {
      authorize: async () => ({ allowed: true, reservationId: 'test', maxUsageUnits: 0 }),
    } })
    await expect(ai.generateText({ system: '', prompt: '' })).rejects.toMatchObject({ reason: 'production_guard_required' })
  })
  it('retries a schema violation once, then falls back to the next provider, recording every attempt', async () => {
    const usage: AIUsageRecord[] = []
    const ai = new AIOrchestrator({
      chain: [fake('a', ['not json', '{"nope":1}']), fake('b', ['```json\n{"message":"hi"}\n```'])],
      maxRetries: 1, onUsage: (r) => { usage.push(r) }, context: { userId: 'u1', sessionId: 's1' },
    })
    const out = await ai.generateStructured({ schema: Schema, system: 's', prompt: 'p' })
    expect(out).toEqual({ message: 'hi' })
    expect(usage.map((u) => `${u.provider}:${u.ok}`)).toEqual(['a:false', 'a:false', 'b:true'])
    expect(usage[0]).toMatchObject({ userId: 'u1', sessionId: 's1', inputTokens: 10, outputTokens: 5 })
  })
  it('throws AIUnavailableError when every provider fails, and records the failures', async () => {
    const usage: AIUsageRecord[] = []
    const ai = new AIOrchestrator({ chain: [fake('a', [new Error('boom')])], maxRetries: 0, onUsage: (r) => { usage.push(r) } })
    await expect(ai.generateText({ system: 's', prompt: 'p' })).rejects.toBeInstanceOf(AIUnavailableError)
    expect(usage).toHaveLength(1); expect(usage[0]!.ok).toBe(false); expect(usage[0]!.error).toBe('provider_error')
  })
  it('aborts a hanging provider at the timeout', async () => {
    const hang: AIProvider = { healthCheck: async () => true, info: { mode: 'live', name: 'slow', notice: null }, generate: (req) => new Promise((_, rej) => req.signal?.addEventListener('abort', () => rej(new Error('aborted')))) }
    const ai = new AIOrchestrator({ chain: [hang], maxRetries: 0, timeoutMs: 30 })
    await expect(ai.generateText({ system: 's', prompt: 'p' })).rejects.toThrow(/timeout 30ms/)
  })
  it('resolves the chain from env and falls back to mock when nothing is configured', () => {
    delete process.env.AI_PROVIDER; delete process.env.AI_FALLBACK_PROVIDER
    expect(resolveAIChain(() => 'x').map((p) => p.info.mode)).toEqual(['mock'])
    process.env.AI_PROVIDER = 'gemini'; process.env.GEMINI_API_KEY = 'k'
    process.env.AI_FALLBACK_PROVIDER = 'cloudflare'; process.env.CLOUDFLARE_ACCOUNT_ID = 'a'; process.env.CLOUDFLARE_API_TOKEN = 't'
    expect(resolveAIChain(() => 'x').map((p) => p.info.name)).toEqual(['gemini/gemini-3.5-flash-lite', 'cloudflare/@cf/meta/llama-3.1-8b-instruct'])
  })

  it('waits before retrying a rate limit, but not a schema error', async () => {
    const delays: number[] = []
    let t = Date.now()
    const failing = (error: string) => ({
      info: { mode: 'live' as const, name: 'p', notice: null }, healthCheck: async () => true,
      generate: async () => { delays.push(Date.now() - t); t = Date.now(); throw new Error(error) },
    })
    for (const [error, expectWait, modelProvider] of [['provider_http_429', true, 'openai'], ['invalid_schema', false, 'gemini']] as const) {
      delays.length = 0; t = Date.now()
      const registry = new ModelRegistry([{ id: 'm', provider: modelProvider, providerModelId: 'm', tier: 'small', capabilities: ['dialogue'], maxContextTokens: 32000 }])
      const ai = new AIOrchestrator({ chain: [failing(error)], registry, resolveModel: () => failing(error), rateLimitBackoffMs: 120 })
      await expect(ai.generateText({ task: 'dialogue', system: '', prompt: 'x' })).rejects.toThrow()
      expect(delays.length).toBe(2)                      // 두 번 시도한다
      if (expectWait) expect(delays[1]).toBeGreaterThanOrEqual(100)
      else expect(delays[1]).toBeLessThan(100)           // 즉시 고쳐질 실패는 기다리지 않는다
    }
  })

  it('records which schema paths an invalid structured output broke, without its text', async () => {
    const usage: AIUsageRecord[] = []
    const provider: AIProvider = { info: { mode: 'live', name: 'p', notice: null }, healthCheck: async () => true,
      generate: async () => ({ text: '{"mood":5,"secret":"model text"}', inputTokens: 1, outputTokens: 1, latencyMs: 1, provider: 'p', model: 'm' }) }
    const ai = new AIOrchestrator({ chain: [provider], maxRetries: 0, onUsage: r => { usage.push(r) } })
    await expect(ai.generateStructured({ task: 'dialogue', system: '', prompt: 'x', schema: z.object({ mood: z.string() }).strict() })).rejects.toThrow('invalid_schema')
    expect(usage[0]!.error).toBe('invalid_schema mood:invalid_type $:unrecognized_keys')
  })

  it('caps aggregate provider calls and reserves capacity for interactive work', async () => {
    process.env.MIRO_AI_PROVIDER_CONCURRENCY = '2'
    const usage: AIUsageRecord[] = []
    const reservations: string[] = []
    const releases: Array<() => void> = []
    const provider: AIProvider = {
      info: { mode: 'live', name: 'shared-capacity', notice: null }, healthCheck: async () => true,
      generate: async () => new Promise(resolve => {
        releases.push(() => resolve({ text: 'ok', provider: 'shared-capacity', model: 'test', inputTokens: 1, outputTokens: 1, latencyMs: 1 }))
      }),
    }
    const make = (workload: 'interactive' | 'background') => new AIOrchestrator({
      chain: [provider], maxRetries: 0, context: { workload, userId: randomUUID(), sessionId: randomUUID() }, onUsage: record => { usage.push(record) },
      budgetGuard: { authorize: async (_request, _model, _context, attemptId) => { reservations.push(attemptId); return { allowed: true, reservationId: attemptId, maxUsageUnits: 0 } } },
    })
    const background = make('background').generateText({ system: '', prompt: 'first' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(releases).toHaveLength(1)
    await expect(make('background').generateText({ system: '', prompt: 'second' })).rejects.toMatchObject({ attempts: 0, last: 'provider_overloaded' })
    const interactive = make('interactive').generateText({ system: '', prompt: 'third' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(releases).toHaveLength(2)
    await expect(make('interactive').generateText({ system: '', prompt: 'fourth' })).rejects.toMatchObject({ attempts: 0, last: 'provider_overloaded' })
    expect(reservations).toHaveLength(2)
    releases.forEach(release => release())
    await expect(Promise.all([background, interactive])).resolves.toEqual(['ok', 'ok'])
    expect(usage).toHaveLength(2)
  })

  it('shares a provider 429 cooldown without reserving or recording skipped calls', async () => {
    const usage: AIUsageRecord[] = []
    let calls = 0
    const provider: AIProvider = {
      info: { mode: 'live', name: 'shared-429', notice: null }, healthCheck: async () => true,
      generate: async () => {
        calls++
        if (calls === 1) throw new Error('provider_http_429')
        return { text: 'ok', provider: 'shared-429', model: 'test', inputTokens: 2, outputTokens: 1, latencyMs: 1 }
      },
    }
    const make = () => new AIOrchestrator({ chain: [provider], maxRetries: 0, rateLimitBackoffMs: 120,
      onUsage: record => { usage.push(record) } })
    await expect(make().generateText({ system: '', prompt: '' })).rejects.toMatchObject({ attempts: 1, last: 'provider_http_429' })
    await expect(make().generateText({ system: '', prompt: '' })).rejects.toMatchObject({ attempts: 0, last: 'provider_overloaded' })
    expect(calls).toBe(1)
    expect(usage).toHaveLength(1)
    expect(usage[0]).toMatchObject({ ok: false, error: 'provider_http_429' })
    await new Promise(resolve => setTimeout(resolve, 130))
    await expect(make().generateText({ system: '', prompt: '' })).resolves.toBe('ok')
    expect(usage).toHaveLength(2)
  })

  it('holds capacity until an aborted provider call actually settles', async () => {
    process.env.MIRO_AI_PROVIDER_CONCURRENCY = '2'
    let settle: (() => void) | undefined
    let calls = 0
    const provider: AIProvider = {
      info: { mode: 'live', name: 'ignores-abort', notice: null }, healthCheck: async () => true,
      generate: async () => {
        calls++
        if (calls === 1) return new Promise(resolve => {
          settle = () => resolve({ text: 'late', provider: 'ignores-abort', model: 'test', inputTokens: null, outputTokens: null, latencyMs: 1 })
        })
        return { text: 'ok', provider: 'ignores-abort', model: 'test', inputTokens: 1, outputTokens: 1, latencyMs: 1 }
      },
    }
    const make = () => new AIOrchestrator({ chain: [provider], maxRetries: 0, timeoutMs: 20, context: { workload: 'background' } })
    const first = make().generateText({ system: '', prompt: '' })
    await Promise.resolve(); await Promise.resolve()
    await expect(first).rejects.toMatchObject({ attempts: 1, last: 'timeout 20ms' })
    await expect(make().generateText({ system: '', prompt: '' })).rejects.toMatchObject({ attempts: 0, last: 'provider_overloaded' })
    expect(settle).toBeTypeOf('function')
    settle!()
    await new Promise(resolve => setTimeout(resolve, 0))
    await expect(make().generateText({ system: '', prompt: '' })).resolves.toBe('ok')
  })

  it('stops renewing and releases a never-settling call after the maximum hold', async () => {
    process.env.MIRO_AI_PROVIDER_CONCURRENCY = '1'
    const heartbeat = vi.fn(async () => true)
    const release = vi.fn(async () => {})
    let calls = 0
    const provider: AIProvider = {
      info: { mode: 'live', name: 'never-settles', notice: null }, healthCheck: async () => true,
      generate: async () => {
        calls++
        if (calls === 1) return new Promise<never>(() => {})
        return { text: 'ok', provider: 'never-settles', model: 'test', inputTokens: 1, outputTokens: 1, latencyMs: 1 }
      },
    }
    const make = () => new AIOrchestrator({ chain: [provider], maxRetries: 0, timeoutMs: 20,
      maxLeaseHoldMs: 100, leaseHeartbeatMs: 15, leaseGuard: { acquire: async () => ({ heartbeat, release }) } })
    await expect(make().generateText({ system: '', prompt: '' })).rejects.toMatchObject({ attempts: 1, last: 'timeout 20ms' })
    await expect(make().generateText({ system: '', prompt: '' })).rejects.toMatchObject({ attempts: 0, last: 'provider_overloaded' })
    await new Promise(resolve => setTimeout(resolve, 130))
    expect(release).toHaveBeenCalledTimes(1)
    const count = heartbeat.mock.calls.length
    await new Promise(resolve => setTimeout(resolve, 45))
    expect(heartbeat).toHaveBeenCalledTimes(count)
    await expect(make().generateText({ system: '', prompt: '' })).resolves.toBe('ok')
  })

  it('cancels an active attempt and records its uncertain usage once', async () => {
    const controller = new AbortController()
    const usage: AIUsageRecord[] = []
    let calls = 0
    const provider: AIProvider = {
      info: { mode: 'live', name: 'cancelled-provider', notice: null }, healthCheck: async () => true,
      generate: async request => {
        calls++
        if (calls > 1) return { text: '{"message":"ok"}', provider: 'cancelled-provider', model: 'test', inputTokens: 1, outputTokens: 1, latencyMs: 1 }
        return new Promise((_, reject) => request.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
      },
    }
    const make = () => new AIOrchestrator({ chain: [provider], maxRetries: 1, onUsage: record => { usage.push(record) } })
    const pending = make().execute({ schema: Schema, task: 'dialogue', system: '', prompt: '', signal: controller.signal })
    await Promise.resolve(); await Promise.resolve()
    controller.abort()
    await expect(pending).rejects.toMatchObject({ attempts: 1, last: 'cancelled' })
    expect(usage).toMatchObject([{ ok: false, error: 'cancelled', inputTokens: null, outputTokens: null }])
    await expect(make().execute({ schema: Schema, task: 'dialogue', system: '', prompt: '' })).resolves.toEqual({ message: 'ok' })
    expect(calls).toBe(2)
  })

  it('fails a call when heartbeat loses ownership and holds capacity until it settles', async () => {
    process.env.MIRO_AI_PROVIDER_CONCURRENCY = '1'
    let settle!: () => void
    const heartbeat = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const release = vi.fn(async () => {})
    const provider: AIProvider = {
      info: { mode: 'live', name: 'lost-heartbeat', notice: null }, healthCheck: async () => true,
      generate: async () => new Promise(resolve => {
        settle = () => resolve({ text: 'late', provider: 'lost-heartbeat', model: 'test', inputTokens: null, outputTokens: null, latencyMs: 1 })
      }),
    }
    const make = () => new AIOrchestrator({ chain: [provider], maxRetries: 0, leaseHeartbeatMs: 20,
      leaseGuard: { acquire: async () => ({ heartbeat, release }) } })
    const pending = make().generateText({ system: '', prompt: '' })
    await expect(pending).rejects.toMatchObject({ attempts: 1, last: 'lease_lost' })
    expect(release).not.toHaveBeenCalled()
    await expect(make().generateText({ system: '', prompt: '' })).rejects.toMatchObject({ attempts: 0, last: 'provider_overloaded' })
    settle()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(release).toHaveBeenCalledTimes(1)
  })

})
