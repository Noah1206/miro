import { afterEach, describe, expect, it, vi } from 'vitest'
import { adultModelReady, createAI } from '../ai/resolve'

/** 성인 모드 대화방(10/2)은 전용 모델로만 — 메인 키(Gemini·예비 GPT)로 넘어가지 않고, 없으면 운영에서 멈춘다. */
describe('adult-only model routing', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
  const ADULT = JSON.stringify([{ id: 'adult', provider: 'openrouter', providerModelId: 'vendor/model', inputCost: 0.5, outputCost: 2, maxContextTokens: 128_000, maxOutputTokens: 4096 }])
  const MAIN = JSON.stringify([{ id: 'main', provider: 'gemini', providerModelId: 'gemini-3.8-flash', tier: 'standard', capabilities: ['dialogue'], inputCost: 1, outputCost: 1, maxContextTokens: 128_000, enabled: true }])

  it('is ready only with a priced registry and its key', () => {
    vi.stubEnv('MIRO_ADULT_MODEL_REGISTRY', '')
    vi.stubEnv('OPENROUTER_API_KEY', '')
    expect(adultModelReady()).toBe(false)
    vi.stubEnv('MIRO_ADULT_MODEL_REGISTRY', ADULT)
    expect(adultModelReady()).toBe(false)
    vi.stubEnv('OPENROUTER_API_KEY', 'k')
    expect(adultModelReady()).toBe(true)
    vi.stubEnv('MIRO_ADULT_MODEL_REGISTRY', '{broken')
    expect(adultModelReady()).toBe(false)
  })

  it('sends every task of an adult room to OpenRouter with data collection denied, ignoring the picked chat model', async () => {
    vi.stubEnv('MIRO_MODEL_REGISTRY', MAIN); vi.stubEnv('GEMINI_API_KEY', 'g')
    vi.stubEnv('MIRO_ADULT_MODEL_REGISTRY', ADULT); vi.stubEnv('OPENROUTER_API_KEY', 'k')
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'hi' } }] })))
    const ai = createAI({ mock: () => ({}), context: { adult: true, dialogueModelId: 'main', continuity: true } })
    await ai.generateText({ system: 's', prompt: 'p', task: 'dialogue' })
    await ai.generateText({ system: 's', prompt: 'p', task: 'memory_extraction' })
    expect(spy).toHaveBeenCalledTimes(2)
    for (const [url, init] of spy.mock.calls) {
      expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions')
      expect(JSON.parse(String(init!.body))).toMatchObject({ model: 'vendor/model', provider: { data_collection: 'deny', require_parameters: true }, reasoning: { effort: 'none', exclude: true } })
    }
  })

  it('fails closed in production when the adult model is missing — never the main model', () => {
    vi.stubEnv('MIRO_MODEL_REGISTRY', MAIN); vi.stubEnv('GEMINI_API_KEY', 'g')
    vi.stubEnv('MIRO_ADULT_MODEL_REGISTRY', ''); vi.stubEnv('VERCEL_ENV', 'production')
    expect(() => createAI({ mock: () => ({}), context: { adult: true } })).toThrow('ADULT_MODEL_REQUIRED')
  })
})
