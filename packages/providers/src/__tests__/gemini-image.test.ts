import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeminiImageProvider } from '../image/gemini'

afterEach(() => vi.unstubAllGlobals())
describe('Gemini messenger images', () => {
  it('passes the character reference and bounded 1K image settings, without retaining interactions', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/jpeg', data: 'YWJj' }] }] }))
    vi.stubGlobal('fetch', fetcher)
    const result = await new GeminiImageProvider('fixture-key').generate({ prompt: 'same character', sceneKey: 'x', aspect: '3:4', references: [{ mimeType: 'image/png', data: 'cmVm' }] })
    const body = JSON.parse(fetcher.mock.calls[0]![1].body)
    expect(body).toMatchObject({ model: 'gemini-nano-banana-2.1', store: false,
      generation_config: { max_output_tokens: 2048 }, response_format: { type: 'image', image_size: '1K', aspect_ratio: '3:4' } })
    expect(body.input[1]).toEqual({ type: 'image', mime_type: 'image/png', data: 'cmVm' })
    expect(result.url).toBe('data:image/jpeg;base64,YWJj')
  })
  it('rejects a refusal or an unfinished image rather than returning a placeholder', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'cannot generate' }] }] })))
    await expect(new GeminiImageProvider('fixture').generate({ prompt: 'x', sceneKey: null, aspect: '1:1' })).rejects.toThrow('missing or invalid')
  })
  it('does not put provider errors or credentials in an exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive detail', { status: 403 })))
    await expect(new GeminiImageProvider('fixture').generate({ prompt: 'x', sceneKey: null, aspect: '1:1' })).rejects.toThrow('gemini image failed: 403')
  })
})
