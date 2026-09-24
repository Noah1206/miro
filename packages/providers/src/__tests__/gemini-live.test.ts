import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeminiLiveCallMediaProvider } from '../call/gemini-live'

const spec = {
  callId: 'c1', characterName: '유진', voiceIdentity: null, visualPrompt: null,
  systemInstruction: '너는 유진이다. 통화 중에는 짧게 말한다.', voiceName: null,
}

afterEach(() => vi.restoreAllMocks())

describe('gemini live ephemeral token', () => {
  it('requests a single-use token with model, prompt and voice locked in', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ name: 'auth_tokens/abc' }), { status: 200 }),
    )
    const p = new GeminiLiveCallMediaProvider('key', 'gemini-3.8-live', 'Kore')
    const s = await p.startSession(spec)

    expect(s.mode).toBe('live')
    expect(s.token).toBe('auth_tokens/abc')
    expect(s.model).toBe('models/gemini-3.8-live')
    expect(s.connectUrl).toMatch(/BidiGenerateContentConstrained$/)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/v1beta/auth_tokens')
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('key')
    const body = JSON.parse(String(init!.body))
    expect(body.uses).toBe(1)
    // REST 형식. SDK 이름(liveConnectConstraints)을 보내면 실제 API 가 400 을 낸다.
    const setup = body.bidiGenerateContentSetup
    expect(body.liveConnectConstraints).toBeUndefined()
    expect(setup.model).toBe('models/gemini-3.8-live')
    expect(setup.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(setup.systemInstruction.parts[0].text).toContain('유진')
    expect(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore')
    expect(setup.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  it('prefers the character voice over the default when given', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ name: 'auth_tokens/x' }), { status: 200 }),
    )
    const p = new GeminiLiveCallMediaProvider('key', 'gemini-3.8-live', 'Kore')
    await p.startSession({ ...spec, voiceName: 'Aoede' })
    const body = JSON.parse(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body))
    expect(body.bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede')
  })

  it('fails loudly when the token endpoint rejects — no silent mock', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 403 }))
    const p = new GeminiLiveCallMediaProvider('key', 'gemini-3.8-live', 'Kore')
    await expect(p.startSession(spec)).rejects.toThrow('gemini_live_token_failed:403')
  })

  it('rejects an empty token body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const p = new GeminiLiveCallMediaProvider('key', 'gemini-3.8-live', 'Kore')
    await expect(p.startSession(spec)).rejects.toThrow('gemini_live_token_failed:empty')
  })
})
