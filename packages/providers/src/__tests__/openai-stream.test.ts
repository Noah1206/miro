import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICompatibleProvider } from '../ai/openai-compatible'
const encoder = new TextEncoder()
const event = (body: unknown) => 'data: ' + JSON.stringify(body) + '\r\n\r\n'
const chunk = (text: string) => event({ model: 'gpt-6-luna', choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })
const finish = (reason = 'stop') => event({ choices: [{ index: 0, delta: {}, finish_reason: reason }] })
const usage = event({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 80 } } })
const provider = () => new OpenAICompatibleProvider('openai', 'fixture', 'gpt-6-luna', 'https://example.test/v1')
const request = { task: 'dialogue', system: '', prompt: '한국어', maxTokens: 2048, hardTokenCap: true }
afterEach(() => vi.restoreAllMocks())
function response(text: string, bytewise = false) {
  const bytes = encoder.encode(text)
  return new Response(new ReadableStream({ start(c) {
    if (bytewise) for (const byte of bytes) c.enqueue(new Uint8Array([byte]))
    else c.enqueue(bytes)
    c.close()
  } }), { headers: { 'content-type': 'text/event-stream' } })
}
describe('GPT streaming', () => {
  it('delivers incremental Korean before completion, with final usage and unchanged output cap', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({ start(c) { controller = c } })))
    const updates: string[] = []
    const generation = provider().generate({ ...request, onText: text => updates.push(text) })
    controller.enqueue(encoder.encode(chunk('기다')))
    await vi.waitFor(() => expect(updates).toEqual(['기다']))
    controller.enqueue(encoder.encode(chunk('렸어.')))
    await vi.waitFor(() => expect(updates.at(-1)).toBe('기다렸어.'))
    controller.enqueue(encoder.encode(finish() + usage + 'data: [DONE]\n\n'))
    controller.close()
    expect(await generation).toMatchObject({ text: '기다렸어.', inputTokens: 100, outputTokens: 20, cachedInputTokens: 80, truncated: false, model: 'gpt-6-luna' })
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).toMatchObject({ stream: true, stream_options: { include_usage: true }, max_completion_tokens: 2048 })
  })
  it('handles byte-split UTF-8, CRLF, comments and usage-only chunks', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(': heartbeat\r\n\r\n' + chunk('안녕🙂') + finish() + usage + 'data: [DONE]\r\n\r\n', true))
    expect((await provider().generate({ ...request, onText: () => {} })).text).toBe('안녕🙂')
  })
  it('rejects incomplete streams even if a partial answer looks valid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(chunk('{}') + finish() + usage))
    await expect(provider().generate({ ...request, onText: () => {} })).rejects.toThrow('provider_stream_incomplete')
  })
  it.each(['length', 'content_filter'] as const)('keeps %s separate from a successful stop', async reason => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(chunk('답') + finish(reason) + usage + 'data: [DONE]\n\n'))
    expect(await provider().generate({ ...request, onText: () => {} })).toMatchObject({ truncated: reason === 'length', blocked: reason === 'content_filter' })
  })
  it('ignores hidden reasoning and refusal deltas', async () => {
    const onText = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(event({ choices: [{ delta: { reasoning_content: 'private', refusal: 'no' } }] }) + finish() + usage + 'data: [DONE]\n\n'))
    expect((await provider().generate({ ...request, onText })).blocked).toBe(true)
    expect(onText).not.toHaveBeenCalled()
  })
  it('stops delivering deltas when the request is aborted', async () => {
    const stop = new AbortController(), onText = vi.fn(() => stop.abort())
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new ReadableStream({ start(c) {
      stop.signal.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError')))
      c.enqueue(encoder.encode(chunk('첫 조각')))
    } })))
    await expect(provider().generate({ ...request, signal: stop.signal, onText })).rejects.toMatchObject({ name: 'AbortError' })
    expect(onText).toHaveBeenCalledTimes(1)
  })
  it('cancels its reader after DONE and does not substitute missing usage with zero', async () => {
    const cancel = vi.fn()
    const stop = new AbortController()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      expect(init?.signal).toBe(stop.signal)
      return new Response(new ReadableStream({ start(c) { c.enqueue(encoder.encode(chunk('안녕') + finish() + 'data: [DONE]\n\n')) }, cancel }))
    })
    expect(await provider().generate({ ...request, signal: stop.signal, onText: () => {} })).toMatchObject({ inputTokens: null, outputTokens: null })
    expect(cancel).toHaveBeenCalled()
  })
})
