import { afterEach, describe, expect, it, vi } from 'vitest'
import { feature, voiceCallAllowed } from '../features'

afterEach(() => vi.unstubAllEnvs())

// 2026-10-01 베타: 운영에서는 전화를 아예 닫는다(덮어쓰기·테스터 목록 포함). 운영 밖에서는 플래그와 테스터 목록이 그대로 동작한다.
describe('voice call: closed in the production beta, tester list only outside production', () => {
  it('in production nobody may call, even with an override or the tester list', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('MIRO_FEATURE_VOICE_CALL', '1')
    vi.stubEnv('MIRO_VOICE_CALL_USERS', 'u1')
    expect(feature('voiceCall')).toBe(false)
    expect(voiceCallAllowed('u1')).toBe(false)
    expect(voiceCallAllowed(null)).toBe(false)
    expect(feature('voiceCallAudio')).toBe(false)
    vi.stubEnv('MIRO_FEATURE_VOICE_CALL_AUDIO', '1')
    expect(feature('voiceCallAudio')).toBe(false)
  })
  it('outside production, turning the flag off falls back to the tester list', () => {
    vi.stubEnv('MIRO_FEATURE_VOICE_CALL', '0')
    vi.stubEnv('MIRO_VOICE_CALL_USERS', ' u1, u2 ,')
    expect(feature('voiceCall')).toBe(false)
    expect(voiceCallAllowed('u1')).toBe(true)
    expect(voiceCallAllowed('u3')).toBe(false)
    expect(voiceCallAllowed(null)).toBe(false)
  })
})
