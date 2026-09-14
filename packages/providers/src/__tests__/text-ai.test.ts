import { afterEach, describe, expect, it } from 'vitest'
import { resolveTextAI } from '../text/resolve'

const saved = { ...process.env }
afterEach(() => { process.env = { ...saved } })

describe('resolveTextAI', () => {
  it('falls back to mock when no provider is configured, and the mock answers from the fallback', async () => {
    delete process.env.AI_PROVIDER; delete process.env.GEMINI_API_KEY
    const p = resolveTextAI((i) => `mock:${i.prompt}`)
    expect(p.info.mode).toBe('mock')
    expect(await p.generateResponse({ system: 's', prompt: 'hi' })).toBe('mock:hi')
  })
  it('picks gemini only when both AI_PROVIDER and the key are set', () => {
    process.env.AI_PROVIDER = 'gemini'; delete process.env.GEMINI_API_KEY
    expect(resolveTextAI(() => '').info.mode).toBe('mock')
    process.env.GEMINI_API_KEY = 'k'; process.env.GEMINI_MODEL = 'gemini-2.5-flash-lite'
    const p = resolveTextAI(() => '')
    expect(p.info).toEqual({ mode: 'live', name: 'gemini/gemini-2.5-flash-lite', notice: null })
  })
})
