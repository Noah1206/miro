import { afterEach, describe, expect, it, vi } from 'vitest'
import { feature, voiceCallAllowed } from '../features'

afterEach(() => vi.unstubAllEnvs())

// 2026-09-29: 운영은 통화를 문자 통화로 모두에게 연다. 실시간 음성만 계속 막는다.
describe('voice call rollout: text calls for everyone, audio blocked', () => {
  it('in production anyone may call, and real-time audio stays off even with an override', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(feature('voiceCall')).toBe(true)
    expect(voiceCallAllowed('u3')).toBe(true)
    expect(voiceCallAllowed(null)).toBe(true)
    expect(feature('voiceCallAudio')).toBe(false)
    vi.stubEnv('MIRO_FEATURE_VOICE_CALL_AUDIO', '1')
    expect(feature('voiceCallAudio')).toBe(false)
  })
  it('turning the flag off in production falls back to the tester list', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('MIRO_FEATURE_VOICE_CALL', '0')
    vi.stubEnv('MIRO_VOICE_CALL_USERS', ' u1, u2 ,')
    expect(feature('voiceCall')).toBe(false)
    expect(voiceCallAllowed('u1')).toBe(true)
    expect(voiceCallAllowed('u3')).toBe(false)
    expect(voiceCallAllowed(null)).toBe(false)
  })
})
