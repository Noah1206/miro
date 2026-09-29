import { characterAgencyMode } from '@miro/config'
import { observe } from '@/lib/observe'
import type { SimulationSnapshot, runTurn } from '@miro/engine'
import type { LLMProvider } from '@miro/providers'
import { loadAgencyEvidence, loadAgencyRuntime } from './runtime'

/** All server-mediated conversation surfaces pin and consume the same session personality. */
export async function prepareAgencyTurn(sessionId: string, userId: string, source: SimulationSnapshot,
  llm: LLMProvider, input: { id: string; text: string }, now = new Date(), policyVersion?: string) {
  if (source.experienceType !== 'reality') return { runtime: null, snapshot: source, agency: undefined }
  const runtime = await loadAgencyRuntime(sessionId, userId, source, llm, now, policyVersion)
  // Until the pinned revision compiles, keep the verified conversation path and hold back only the
  // new autonomy (plan §3.1). loadAgencyRuntime has already scheduled the compile.
  if (runtime?.mode !== 'live' && characterAgencyMode(sessionId, policyVersion) === 'live') {
    observe('agency.not_ready_fallback', { sessionId })
    return { runtime: null, snapshot: source, agency: undefined }
  }
  const snapshot = runtime?.mode === 'live' ? { ...source, ...runtime.revision.profile } : source
  const agency: Parameters<typeof runTurn>[0]['agency'] = runtime ? {
    mode: runtime.mode, compiled: runtime.revision.compiled, state: runtime.state,
    context: { sessionId, revisionId: runtime.revision.id, actor: snapshot.character.id,
      authored: runtime.revision.authored, world: snapshot.world, relationship: snapshot.relationship,
      evidence: (await loadAgencyEvidence(sessionId, snapshot, runtime, input, now)).slice(-126),
      clock: { now: now.toISOString(), mode: 'real_time', trigger: 'user', allowOfflineAdvance: false },
      // 이동 의도는 만나서 나누는 장면에서만 — 문자·통화 중에 자리를 옮긴다고 서술할 화면이 없다.
      permissions: { contact: false, capabilities: ['respond', 'ask', 'decline', 'defer', 'disclose', 'set_boundary', 'cancel_commitment', 'wait', ...(!snapshot.mode || snapshot.mode === 'chat' ? ['move'] : [])] },
      location: snapshot.world.currentLocation,
    },
  } : undefined
  return { runtime, snapshot, agency }
}
