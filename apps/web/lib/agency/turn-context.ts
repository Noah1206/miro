import { characterAgencyMode } from '@miro/config'
import type { SimulationSnapshot, runTurn } from '@miro/engine'
import type { LLMProvider } from '@miro/providers'
import { loadAgencyEvidence, loadAgencyRuntime } from './runtime'

/** All server-mediated conversation surfaces pin and consume the same session personality. */
export async function prepareAgencyTurn(sessionId: string, userId: string, source: SimulationSnapshot,
  llm: LLMProvider, input: { id: string; text: string }, now = new Date()) {
  const runtime = await loadAgencyRuntime(sessionId, userId, source, llm, now)
  if (runtime?.mode !== 'live' && characterAgencyMode(sessionId) === 'live') throw new Error('agency_not_ready')
  const snapshot = runtime?.mode === 'live' ? { ...source, ...runtime.revision.profile } : source
  const agency: Parameters<typeof runTurn>[0]['agency'] = runtime ? {
    mode: runtime.mode, compiled: runtime.revision.compiled, state: runtime.state,
    context: { sessionId, revisionId: runtime.revision.id, actor: snapshot.character.id,
      authored: runtime.revision.authored, world: snapshot.world, relationship: snapshot.relationship,
      evidence: await loadAgencyEvidence(sessionId, snapshot, runtime, input, now),
      clock: { now: now.toISOString(), mode: 'real_time', trigger: 'user', allowOfflineAdvance: false },
      permissions: { contact: false, capabilities: ['respond', 'ask', 'decline', 'defer', 'disclose', 'set_boundary', 'cancel_commitment', 'wait'] },
      location: snapshot.world.currentLocation,
    },
  } : undefined
  return { runtime, snapshot, agency }
}
