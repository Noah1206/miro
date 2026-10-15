import { afterEach, expect, it, vi } from 'vitest'
import { streamTurn } from '../stream-turn'

afterEach(() => vi.restoreAllMocks())
it('completes and unlocks the composer as soon as the saved result arrives, even if transport stays open', async () => {
  const encoder = new TextEncoder()
  const cancel = vi.fn()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({
    start(c) { c.enqueue(encoder.encode(JSON.stringify({ type: 'done', state: { succeeded: true, error: null, notice: null, limit: null } }) + '\n')) }, cancel,
  })))
  const result = await Promise.race([streamTurn(new FormData(), vi.fn()), new Promise(resolve => setTimeout(() => resolve('stuck'), 100))])
  expect(result).toMatchObject({ succeeded: true })
})
it('preserves retry semantics if the transport ends without a saved result', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"type":"reset"}\n'))
  await expect(streamTurn(new FormData(), vi.fn())).rejects.toThrow('stream_incomplete')
})
