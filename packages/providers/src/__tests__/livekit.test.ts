import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
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
