import { productionRuntime } from './runtime'

export type CharacterAgencyMode = 'off' | 'shadow' | 'live'

/** Opt-in cohort, never silently roll the new policy out to existing sessions. */
export function characterAgencyMode(sessionId?: string): CharacterAgencyMode {
  const value = process.env.MIRO_CHARACTER_AGENCY_MODE
  if (value !== 'shadow' && value !== 'live') return 'off'
  // Production shadow requires a separate experiment budget and provider identity. Until that
  // adapter exists it cannot consume the interactive user's reservations or change their output.
  if (value === 'shadow' && productionRuntime()) return 'off'
  if (!sessionId) return value
  const cohort = (process.env.MIRO_CHARACTER_AGENCY_SESSIONS ?? '').split(',').map(v => v.trim())
  if (cohort.includes(sessionId) || (!productionRuntime() && cohort.includes('*'))) return value
  return 'off'
}
