import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AIOrchestrator, AIUnavailableError } from '../ai/orchestrator'
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
})
