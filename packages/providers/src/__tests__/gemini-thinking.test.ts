import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeminiProvider, thinkingConfig } from '../ai/gemini'

/**
 * 2026-09 실측. 틀린 값은 400 으로 턴 전체가 죽고, 빠뜨리면 턴마다 생각 토큰 700~1,100개가 출력 단가로 나간다.
 *   3.8-flash  : minimal → 400, low → 생각 0
 *   3.5-flash  : low → 여전히 716, budget 0 → 생각 0
 *   3.1-pro    : budget 0 → 400 ("only works in thinking mode"), low → ≈630
 */
describe('gemini thinking config', () => {
  it('sends the one setting each model accepts', () => {
    expect(thinkingConfig('gemini-3.5-flash-lite')).toEqual({ thinkingConfig: { thinkingLevel: 'minimal' } })
    expect(thinkingConfig('gemini-3.5-flash')).toEqual({ thinkingConfig: { thinkingBudget: 0 } })
    expect(thinkingConfig('gemini-3.8-flash')).toEqual({ thinkingConfig: { thinkingLevel: 'low' } })
    expect(thinkingConfig('gemini-3.1-pro-preview')).toEqual({ thinkingConfig: { thinkingLevel: 'low' } })
    expect(thinkingConfig('gemini-2.5-flash')).toEqual({ thinkingConfig: { thinkingBudget: 0 } })
    expect(thinkingConfig('gemini-4-argon')).toEqual({ thinkingConfig: { thinkingLevel: 'low' } })
    expect(thinkingConfig('gemini-4-argon', 'medium')).toEqual({ thinkingConfig: { thinkingLevel: 'medium' } })
  })
  it('sends nothing for a model it has not measured', () => {
    expect(thinkingConfig('gemini-4.0-something')).toEqual({})
  })
  it('raises the level only where the model takes a level (2026-09-29: 3.8-flash medium ≈ 135 thought tokens on a trivial prompt)', () => {
    expect(thinkingConfig('gemini-3.8-flash', 'medium')).toEqual({ thinkingConfig: { thinkingLevel: 'medium' } })
    expect(thinkingConfig('gemini-3.5-flash-lite', 'high')).toEqual({ thinkingConfig: { thinkingLevel: 'minimal' } })
    expect(thinkingConfig('gemini-3.5-flash', 'high')).toEqual({ thinkingConfig: { thinkingBudget: 0 } })
  })
})

describe('gemini structured output', () => {
  afterEach(() => vi.restoreAllMocks())
  it('sends a response schema only with JSON mode', async () => {
    const bodies: Array<{ generationConfig: Record<string, unknown> }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }))
    })
    const gemini = new GeminiProvider('key', 'gemini-3.8-flash')
    const schema = { type: 'object', properties: {}, required: [] }
    await gemini.generate({ task: 'world_update', system: '', prompt: '', json: true, responseSchema: schema })
    await gemini.generate({ task: 'dialogue', system: '', prompt: '', responseSchema: schema })
    expect(bodies[0]!.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: schema })
    expect(bodies[1]!.generationConfig).not.toHaveProperty('responseJsonSchema')
  })
})

describe('gemini sampling request compatibility', () => {
  afterEach(() => vi.restoreAllMocks())
  it.each(['gemini-3-flash', 'gemini-3.1-pro-preview', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-4', 'gemini-4.0-pro'])
    ('omits sampling overrides for %s, including the provider default', async model => {
      const bodies: Array<{ generationConfig: Record<string, unknown> }> = []
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)))
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] }))
      })
      const gemini = new GeminiProvider('key', model)
      await gemini.generate({ task: 'dialogue', system: 'system', prompt: 'hello', maxTokens: 256 })
      await gemini.generate({ task: 'dialogue', system: 'system', prompt: 'hello', maxTokens: 256, temperature: 0.2 })
      for (const body of bodies) {
        expect(body.generationConfig).toMatchObject({ maxOutputTokens: 256, ...thinkingConfig(model) })
        for (const parameter of ['temperature', 'topP', 'topK', 'top_p', 'top_k']) {
          expect(body.generationConfig).not.toHaveProperty(parameter)
        }
      }
    })

  it.each(['gemini-2.0-flash', 'gemini-2.5-flash'])
    ('preserves the default and an explicit zero temperature for %s', async model => {
      const bodies: Array<{ generationConfig: Record<string, unknown> }> = []
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)))
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] }))
      })
      const gemini = new GeminiProvider('key', model)
      await gemini.generate({ task: 'dialogue', system: '', prompt: '' })
      await gemini.generate({ task: 'dialogue', system: '', prompt: '', temperature: 0 })
      expect(bodies[0]!.generationConfig.temperature).toBe(0.9)
      expect(bodies[1]!.generationConfig.temperature).toBe(0)
    })
})

// 2026-10-17: 대사가 다 만들어질 때까지 아무것도 안 보였다 — 화면에 보낼 곳이 있으면 SSE 로 받아 조각마다 이어 붙인 전체를 넘긴다.
describe('gemini streaming', () => {
  afterEach(() => vi.restoreAllMocks())
  const sse = (events: unknown[]) => new Response(new ReadableStream({ start(c) {
    const enc = new TextEncoder()
    // 조각 경계가 줄 중간에 걸려도 이어 붙여 읽는지 본다
    const raw = events.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join('')
    for (let i = 0; i < raw.length; i += 7) c.enqueue(enc.encode(raw.slice(i, i + 7)))
    c.close()
  } }), { status: 200 })
  it('reports the accumulated text as it arrives and returns the same result as a single call', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(sse([
      { candidates: [{ content: { parts: [{ text: '생각', thought: true }] } }] },
      { candidates: [{ content: { parts: [{ text: '{"rp":{"blocks":[' }] } }] },
      { candidates: [{ content: { parts: [{ text: '{"type":"dialogue"}]}}' }] }, finishReason: 'STOP' }], modelVersion: 'gemini-3.6-flash-20261001', usageMetadata: { promptTokenCount: 10, cachedContentTokenCount: 4, candidatesTokenCount: 5, thoughtsTokenCount: 2 } },
    ]))
    const seen: string[] = []
    const out = await new GeminiProvider('key', 'gemini-3.6-flash').generate({ task: 'dialogue', system: 's', prompt: 'p', json: true, onText: text => { seen.push(text) } })
    expect(String(fetchMock.mock.calls[0]![0])).toContain(':streamGenerateContent?alt=sse')
    expect(seen).toEqual(['{"rp":{"blocks":[', '{"rp":{"blocks":[{"type":"dialogue"}]}}'])
    expect(out).toMatchObject({ text: '{"rp":{"blocks":[{"type":"dialogue"}]}}', model: 'gemini-3.6-flash-20261001', inputTokens: 10, cachedInputTokens: 4, outputTokens: 7, truncated: false, blocked: false })
  })
  it('keeps the single call when nothing is shown while it is written', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }] }), { status: 200 }))
    await new GeminiProvider('key', 'gemini-3.6-flash').generate({ task: 'dialogue', system: 's', prompt: 'p', json: true })
    expect(String(fetchMock.mock.calls[0]![0])).toContain(':generateContent')
  })
})
