import type { z } from 'zod'
import { createAgencyState, type AgencyEvidence, type AuthoredDocument } from '@miro/domain'
import type { LLMProvider } from '@miro/providers'
import { AgencyCompilerProposalSchema, compileAuthoredCharacter, hashAuthoredCharacter } from '../compiler'
import { AgencyPlanProposalSchema, type AgencyPlanningContext } from '../planner'

export const NOW = '2026-09-24T06:00:00.000Z'
export const DOCUMENT: AuthoredDocument = {
  fields: {
    'identity.name': '도윤',
    'personality.personality': '자존심이 세지만 자신의 잘못은 인정한다. 약속을 우선하며 감정은 절제해서 말한다.',
    'identity.nationality': '한국',
  },
  explicitFields: ['identity.name', 'personality.personality', 'identity.nationality'],
}

export function compileProposal(): z.infer<typeof AgencyCompilerProposalSchema> {
  const statement = DOCUMENT.fields['personality.personality']!
  return { rules: [
    { id: 'value-promise', domain: 'value', statement, source: { field: 'personality.personality', quote: statement }, origin: 'explicit', confidence: .9, priority: .8,
      exceptions: ['자신의 잘못은 인정한다'] },
    { id: 'identity-name', domain: 'identity', statement: '도윤', source: { field: 'identity.name', quote: '도윤' }, origin: 'explicit', confidence: 1 },
  ], unresolved: [] }
}

export function evidence(over: Partial<AgencyEvidence> = {}): AgencyEvidence {
  return { sessionId: 'session-1', id: 'message-1', actor: 'user', quote: '내일 읽을 책을 같이 정하자.', kind: 'message',
    epistemic: 'observed', occurredAt: NOW, knownTo: ['character-1'], ...over }
}
export function planningContext(over: Partial<AgencyPlanningContext> = {}): AgencyPlanningContext {
  return {
    sessionId: 'session-1', revisionId: 'revision-1', actor: 'character-1', evidence: [evidence()],
    clock: { now: NOW, mode: 'real_time', trigger: 'user', allowOfflineAdvance: false },
    permissions: { contact: true, capabilities: ['respond', 'ask', 'decline', 'defer', 'disclose', 'set_boundary', 'cancel_commitment', 'wait', 'contact', 'message'] }, location: '서점', authored: DOCUMENT,
    world: { currentLocation: '서점', currentTime: '오후', worldStatus: null }, ...over,
  }
}

export function planProposal(): z.infer<typeof AgencyPlanProposalSchema> {
  return {
    appraisal: { interpretation: '상대가 함께 읽을 책을 정하자고 제안했다.', evidenceIds: ['message-1'], ruleIds: ['value-promise'],
      goalCongruence: .6, valueConflict: 0, responsibility: 'uncertain',
      affectDelta: { valence: 2, arousal: 0, stress: -1, energy: 0 }, expression: { openness: 30, directness: 50 }, beliefs: [] },
    candidates: [{ id: 'ask-book', action: 'ask', description: '읽고 싶은 책을 물어본다.', targetActor: 'character-1',
      evidenceIds: ['message-1'], ruleIds: ['value-promise'], goalIds: [], ruleFit: [{ ruleId: 'value-promise', fit: .5 }], goalFit: [],
      preconditions: [], uncertainty: .1, cost: .1 }],
    newGoals: [], goalChanges: [],
  }
}

/** Recorded synthetic provider, explicitly marked mock; no network, env credentials or DB. */
export function recordedProvider(outputs: unknown[], calls: Array<{ task?: string; promptVersion?: string; prompt: string }> = []): LLMProvider {
  const queue = [...outputs]
  return {
    info: { mode: 'mock', name: 'agency-recorded-fixture', notice: 'Synthetic replay; not live model evaluation.' },
    async generateStructured(opts) {
      calls.push({ task: opts.task, promptVersion: opts.promptVersion, prompt: opts.prompt })
      const next = queue.shift()
      if (next instanceof Error) throw next
      if (next === undefined) throw new Error('recorded_output_exhausted')
      return opts.schema.parse(next)
    },
  }
}

export async function setupCompiled() {
  const result = await compileAuthoredCharacter(recordedProvider([compileProposal()]), DOCUMENT, hashAuthoredCharacter(DOCUMENT))
  return { compiled: result.compiled, state: createAgencyState('revision-1', NOW), context: planningContext() }
}
