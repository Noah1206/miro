import { afterEach, describe, expect, it, vi } from 'vitest'
import { characterAgencyCohort, characterAgencyMode, defaultSessionPolicy } from '../character-agency'
afterEach(() => vi.unstubAllEnvs())
describe('character agency rollout gate', () => {
  it('is off by default and for unknown modes', () => {
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', '')
    expect(characterAgencyMode('s1')).toBe('off')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'on')
    expect(characterAgencyMode('s1')).toBe('off')
  })
  it('requires an explicit session cohort and immediately obeys the kill switch', () => {
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'live')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', 's1, s2')
    expect(characterAgencyMode('s1')).toBe('live')
    expect(characterAgencyMode('s3')).toBe('off')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'off')
    expect(characterAgencyMode('s1')).toBe('off')
  })
  it('reads one cohort list for every caller and ignores the wildcard in production', () => {
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', ' s1, *,s2 ,')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(characterAgencyCohort()).toEqual({ all: true, ids: ['s1', 's2'] })
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(characterAgencyCohort()).toEqual({ all: false, ids: ['s1', 's2'] })
  })
  it('permits wildcard only outside production', () => {
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'shadow')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', '*')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(characterAgencyMode('s1')).toBe('shadow')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(characterAgencyMode('s1')).toBe('off')
  })
  // §6: 세션 정책 버전은 코호트 목록과 별개의 제품 기본값이지만, 중단 스위치 아래에 있다.
  it('a session pinned to agency:v1 is live without the cohort list, and the kill switch still wins', () => {
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'live')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', '')
    expect(characterAgencyMode('s9', 'agency:v1')).toBe('live')
    expect(characterAgencyMode('s9', 'legacy:v1')).toBe('off')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'shadow')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(characterAgencyMode('s9', 'agency:v1')).toBe('off')   // 정책 버전은 shadow 를 만들지 않는다
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'off')
    expect(characterAgencyMode('s9', 'agency:v1')).toBe('off')
  })
  it('new sessions default to legacy unless the product default names agency, and standard characters never do', () => {
    vi.stubEnv('MIRO_AGENCY_DEFAULT_POLICY', '')
    expect(defaultSessionPolicy('reality')).toBe('legacy:v1')
    vi.stubEnv('MIRO_AGENCY_DEFAULT_POLICY', 'agency:v1')
    expect(defaultSessionPolicy('reality')).toBe('agency:v1')
    expect(defaultSessionPolicy('chat')).toBe('legacy:v1')
  })
})
