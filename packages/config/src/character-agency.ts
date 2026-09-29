import { productionRuntime } from './runtime'

export type CharacterAgencyMode = 'off' | 'shadow' | 'live'

/** Session IDs opted into the experiment. The '*' wildcard is honoured only outside production. */
export function characterAgencyCohort(): { all: boolean; ids: string[] } {
  const entries = (process.env.MIRO_CHARACTER_AGENCY_SESSIONS ?? '').split(',').map(v => v.trim()).filter(Boolean)
  return { all: !productionRuntime() && entries.includes('*'), ids: entries.filter(v => v !== '*') }
}

export type SessionPolicyVersion = 'legacy:v1' | 'agency:v1'

/**
 * 새 세션의 정책 버전(§6.2). 운영 코호트(env 세션 목록)와 별개의 제품 기본값 — MIRO_AGENCY_DEFAULT_POLICY=agency:v1 이면
 * 새 미로 세션이 자율성 경로로 시작한다. 일반 캐릭터는 늘 legacy. 기존 세션은 바뀌지 않는다(switchSessionPolicy 로만).
 */
export function defaultSessionPolicy(experience: 'chat' | 'reality'): SessionPolicyVersion {
  return experience === 'reality' && process.env.MIRO_AGENCY_DEFAULT_POLICY === 'agency:v1' ? 'agency:v1' : 'legacy:v1'
}

/**
 * Opt-in cohort, never silently roll the new policy out to existing sessions.
 * 세션의 정책 버전이 agency:v1 이면 코호트 목록에 없어도 live 다 — 단 MIRO_CHARACTER_AGENCY_MODE 가 live 일 때만(중단 스위치, §6.6).
 */
export function characterAgencyMode(sessionId?: string, policyVersion?: string): CharacterAgencyMode {
  const value = process.env.MIRO_CHARACTER_AGENCY_MODE
  if (value !== 'shadow' && value !== 'live') return 'off'
  // Production shadow requires a separate experiment budget and provider identity. Until that
  // adapter exists it cannot consume the interactive user's reservations or change their output.
  if (value === 'shadow' && productionRuntime()) return 'off'
  if (!sessionId) return value
  if (value === 'live' && policyVersion === 'agency:v1') return 'live'
  const cohort = characterAgencyCohort()
  return cohort.all || cohort.ids.includes(sessionId) ? value : 'off'
}
