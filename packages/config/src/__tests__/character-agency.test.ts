import { afterEach, describe, expect, it, vi } from 'vitest'
import { characterAgencyMode } from '../character-agency'
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
  it('permits wildcard only outside production', () => {
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'shadow')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', '*')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(characterAgencyMode('s1')).toBe('shadow')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(characterAgencyMode('s1')).toBe('off')
  })
})
