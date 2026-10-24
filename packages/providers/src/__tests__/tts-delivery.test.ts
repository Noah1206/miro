import { afterEach, expect, it, vi } from 'vitest'
import { resolveTts } from '../tts'
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it('forwards local utterance delivery and private credentials with the cancellation signal', async () => {
  vi.stubEnv('MIRO_TTS_URL', 'https://voice.example.test/')
  vi.stubEnv('MIRO_TTS_API_KEY', 'test-only-key')
  const fetched = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'audio/wav' } }))
  vi.stubGlobal('fetch', fetched)
  const controller = new AbortController()
  const request = { text: '나 여기 있어.', voice: 'male-a', language: 'ko', style: 'whisper' as const,
    delivery: { emotion: 'hurt' as const, tone: 'whisper' as const, pace: 'slow' as const, intensity: 'soft' as const, pauseAfterMs: 400 } }
  const result = await resolveTts()!.speak(request, controller.signal)
  expect(fetched.mock.calls[0]![0]).toBe('https://voice.example.test/speak')
  const options = fetched.mock.calls[0]![1] as RequestInit
  expect(JSON.parse(options.body as string)).toEqual(request)
  expect(options.signal).toBe(controller.signal)
  expect(options.headers).toMatchObject({ authorization: 'Bearer test-only-key' })
  expect(result.contentType).toBe('audio/wav')
})
it('rejects non-audio and oversized provider responses before buffering them',async()=>{
  vi.stubEnv('MIRO_TTS_URL','https://voice.example.test')
  const request={text:'안녕',voice:'test',language:'ko'}
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'private'})))
  await expect(resolveTts()!.speak(request)).rejects.toThrow('invalid tts audio')
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([1]),{headers:{'content-type':'audio/wav','content-length':String(5*1024*1024)}})))
  await expect(resolveTts()!.speak(request)).rejects.toThrow('invalid tts audio')
})
