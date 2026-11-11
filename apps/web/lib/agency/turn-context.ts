import { POLICY, characterAgencyMode } from '@miro/config'
import { agencyClock, withRelationshipProfile } from '@miro/domain'
import { observe } from '@/lib/observe'
import type { SimulationSnapshot, runTurn } from '@miro/engine'
import type { LLMProvider } from '@miro/providers'
import { loadAgencyEvidence, loadAgencyRuntime } from './runtime'
import { adoptRelationshipPolicy } from './session-policy'

/** All server-mediated conversation surfaces pin and consume the same session personality. */
export async function prepareAgencyTurn(sessionId: string, userId: string, source: SimulationSnapshot,
  llm: LLMProvider, input: { id: string; text: string }, now = new Date(), policyVersion?: string) {
  if (source.experienceType !== 'reality') return { runtime: null, snapshot: source, agency: undefined }
  // 11/11 언베일 턴은 자율성 계획을 건너뛴다(대화 경로로) — 계획 모델이 거절을 고르거나, 거절 선택지를 빼면 '기다림'으로 떨어져
  // 대사가 그 결정대로 막았다(모녀덮밥 방). 계획 없는 경로(문라이트 방)는 유저가 이끄는 대로 이어졌다. 사용자: 베이비챗처럼 원하는 대로 진행.
  // 11/11 사용자: 모든 대화를 베이비챗처럼 — 대화방(chat)은 계획 없이 유저가 이끄는 대로. 자율성 계획은 통화·라이브처럼 다른 화면에만 남긴다.
  if (source.adultMode || !source.mode || source.mode === 'chat') return { runtime: null, snapshot: source, agency: undefined }
  const effectivePolicy = await adoptRelationshipPolicy(sessionId, userId) ?? policyVersion
  const runtime = await loadAgencyRuntime(sessionId, userId, source, llm, now, effectivePolicy)
  // Until the pinned revision compiles, keep the verified conversation path and hold back only the
  // new autonomy (plan §3.1). loadAgencyRuntime has already scheduled the compile.
  if (runtime?.mode !== 'live' && characterAgencyMode(sessionId, effectivePolicy) === 'live') {
    observe('agency.not_ready_fallback', { sessionId })
    return { runtime: null, snapshot: source, agency: undefined, policyVersion: effectivePolicy }
  }
  // 관계 성격표는 판에 고정하지 않는다 — 설정에서 파생돼 따로 갱신되므로 지금의 표를 얹는다.
  const snapshot = runtime?.mode === 'live' ? { ...source, ...runtime.revision.profile,
    character: withRelationshipProfile(runtime.revision.profile.character, source.character.personality.relationshipProfile) } : source
  const agency: Parameters<typeof runTurn>[0]['agency'] = runtime ? {
    mode: runtime.mode, compiled: runtime.revision.compiled, state: runtime.state,
    context: { sessionId, revisionId: runtime.revision.id, actor: snapshot.character.id,
      authored: runtime.revision.authored, world: snapshot.world, relationship: snapshot.relationship,
      evidence: (await loadAgencyEvidence(sessionId, snapshot, runtime, input, now)).slice(-126),
      clock: agencyClock(now, snapshot.clock?.timeZone ?? POLICY.reality.defaultTimeZone, 'user', !snapshot.mode || snapshot.mode === 'chat' ? snapshot.world.narrativeCalendar?.date : null),
      // 이동 의도는 만나서 나누는 장면에서만 — 문자·통화 중에 자리를 옮긴다고 서술할 화면이 없다.
      permissions: { contact: false, capabilities: ['respond', 'ask', 'decline', 'defer', 'disclose', 'set_boundary', 'cancel_commitment', 'wait', ...(!snapshot.mode || snapshot.mode === 'chat' ? ['move'] : [])] },
      location: snapshot.world.currentLocation,
    },
  } : undefined
  return { runtime, snapshot, agency, policyVersion: effectivePolicy }
}
