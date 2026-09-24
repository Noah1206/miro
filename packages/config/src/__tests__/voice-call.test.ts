import { afterEach, describe, expect, it, vi } from 'vitest'
import { feature, voiceCallAllowed } from '../features'

afterEach(() => vi.unstubAllEnvs())

// 운영은 음성통화를 막아 둔 채, 실제 기기로 확인할 계정만 먼저 연다.
describe('voice call staged rollout', () => {
  it('in production only listed testers may call, and the global flag stays off', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('MIRO_VOICE_CALL_USERS', ' u1, u2 ,')
    expect(feature('voiceCall')).toBe(false)
    expect(voiceCallAllowed('u1')).toBe(true)
    expect(voiceCallAllowed('u3')).toBe(false)
    expect(voiceCallAllowed(null)).toBe(false)
  })
  it('an override cannot open it in production, and outside production the preset decides', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('MIRO_FEATURE_VOICE_CALL', '1')
    expect(voiceCallAllowed('anyone')).toBe(false)
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('NODE_ENV', 'test')
    expect(voiceCallAllowed('anyone')).toBe(true)
  })
})
