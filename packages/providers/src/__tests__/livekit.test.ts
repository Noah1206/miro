import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveKitCallMediaProvider } from '../call/livekit'

const spec = { callId: 'c1', characterName: '토마스', voiceIdentity: null, visualPrompt: 'a face' }
const decode = (t: string) => JSON.parse(Buffer.from(t.split('.')[1]!, 'base64url').toString('utf8'))

describe('livekit token', () => {
  it('signs a joinable token for the call room', async () => {
    const p = new LiveKitCallMediaProvider('voice', 'key', 'secret', 'wss://x.livekit.cloud')
    const s = await p.startSession(spec)
    expect(s.mode).toBe('live')
    expect(s.connectUrl).toBe('wss://x.livekit.cloud')
    const c = decode(s.token)
    expect(c.iss).toBe('key')
    expect(c.video.room).toBe('miro-c1')
    expect(c.video.roomJoin).toBe(true)
    expect(c.exp).toBeGreaterThan(c.nbf)
  })

  it('verifies under the shared secret', async () => {
    const p = new LiveKitCallMediaProvider('voice', 'key', 'secret', 'wss://x')
    const [h, b, sig] = (await p.startSession(spec)).token.split('.')
    expect(createHmac('sha256', 'secret').update(`${h}.${b}`).digest('base64url')).toBe(sig)
  })

  it('does not grant camera on a voice call', async () => {
    const voice = new LiveKitCallMediaProvider('voice', 'k', 's', 'wss://x')
    expect(decode((await voice.startSession(spec)).token).video.canPublishSources).toEqual(['microphone'])
    const video = new LiveKitCallMediaProvider('video', 'k', 's', 'wss://x')
    expect(decode((await video.startSession(spec)).token).video.canPublishSources).toContain('camera')
  })

  it('carries the visual prompt only for video', async () => {
    const voice = new LiveKitCallMediaProvider('voice', 'k', 's', 'wss://x')
    expect(JSON.parse(decode((await voice.startSession(spec)).token).metadata).visualPrompt).toBeNull()
    const video = new LiveKitCallMediaProvider('video', 'k', 's', 'wss://x')
    expect(JSON.parse(decode((await video.startSession(spec)).token).metadata).visualPrompt).toBe('a face')
  })
})

 describe('livekit room cleanup', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('deletes the same room using a server-side call id', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', request)
    const provider = new LiveKitCallMediaProvider('voice', 'key', 'secret', 'wss://x.livekit.cloud')
    await provider.endSession({ callId: 'c1' })
    const [url, options] = request.mock.calls[0]!
    expect(url).toBe('https://x.livekit.cloud/twirp/livekit.RoomService/DeleteRoom')
    expect(JSON.parse(options.body)).toEqual({ room: 'miro-c1' })
    expect(decode(options.headers.Authorization.slice(7)).video).toEqual({ roomAdmin: true, room: 'miro-c1' })
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })
  it('reports cleanup failure but accepts an already removed room', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', request)
    const provider = new LiveKitCallMediaProvider('video', 'key', 'secret', 'wss://x')
    await expect(provider.endSession({ callId: 'c1' })).rejects.toThrow('CALL_ROOM_CLEANUP_FAILED')
    await expect(provider.endSession({ callId: 'c1' })).resolves.toBeUndefined()
  })
})
