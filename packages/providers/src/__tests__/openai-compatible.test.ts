import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICompatibleProvider } from '../ai/openai-compatible'

/** 강한 일의 예비(GPT-5.4 mini, 10/2). GPT-5 계열은 max_tokens·temperature 를 400 으로 거절하고, 실패는 Gemini 와 같은 이름으로 던져야 재시도·예비 전환이 돈다. */
describe('OpenAI-compatible adapter', () => {
  afterEach(() => vi.restoreAllMocks())
  const respond = (...replies: Array<[unknown, number?]>) => {
    const spy = vi.spyOn(globalThis, 'fetch')
    for (const [body, status] of replies) spy.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: status ?? 200 }))
    return spy
  }
  const gpt = () => new OpenAICompatibleProvider('openai', 'k', 'gpt-5.4-mini', 'https://example.test/v1')

  it('speaks GPT-5: max_completion_tokens, reasoning none, no temperature, the schema as a decoding hint', async () => {
    const spy = respond([{ choices: [{ finish_reason: 'stop', message: { content: '{"a":1}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }])
    const schema = { type: 'object', properties: { a: { type: 'number' } }, required: ['a'] }
    const out = await gpt().generate({ task: 'dialogue', system: 's', prompt: 'p', json: true, responseSchema: schema, maxTokens: 100, temperature: 0.2 })
    const body = JSON.parse(String(spy.mock.calls[0]![1]!.body))
    expect(body).toMatchObject({ model: 'gpt-5.4-mini', max_completion_tokens: 100, reasoning_effort: 'none',
      response_format: { type: 'json_schema', json_schema: { name: 'output', schema, strict: false } } })
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('max_tokens')
    expect(out).toMatchObject({ text: '{"a":1}', inputTokens: 3, outputTokens: 2, truncated: false, blocked: false })
  })

  it('keeps the plain OpenAI shape for other models behind the same endpoint', async () => {
    const spy = respond([{ choices: [{ message: { content: '{}' } }] }])
    const out = await new OpenAICompatibleProvider('gateway', 'k', 'anthropic/claude-haiku-4-5', 'https://example.test/v1').generate({ task: 'dialogue', system: '', prompt: '', json: true, maxTokens: 50 })
    expect(JSON.parse(String(spy.mock.calls[0]![1]!.body))).toMatchObject({ max_tokens: 50, temperature: 0.9, response_format: { type: 'json_object' } })
    expect(out.truncated).toBeUndefined()
  })

  it('throws failures as provider_http_<status> and reports refusals and cut-offs', async () => {
    respond([{ error: { message: 'overloaded' } }, 503], [{ error: { message: 'slow down' } }, 429],
      [{ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'no' } }] }],
      [{ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] }],
      [{ choices: [{ finish_reason: 'length', message: { content: '{"a":' } }] }])
    await expect(gpt().generate({ task: 'dialogue', system: '', prompt: '' })).rejects.toThrow(/^provider_http_503$/)
    await expect(gpt().generate({ task: 'dialogue', system: '', prompt: '' })).rejects.toThrow(/^provider_http_429$/)
    expect((await gpt().generate({ task: 'dialogue', system: '', prompt: '' })).blocked).toBe(true)
    expect((await gpt().generate({ task: 'dialogue', system: '', prompt: '' })).blocked).toBe(true)
    expect((await gpt().generate({ task: 'dialogue', system: '', prompt: '' })).truncated).toBe(true)
  })
})
