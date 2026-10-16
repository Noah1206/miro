import { describe, expect, it } from 'vitest'
import { createAgencyState, type CompiledCharacter } from '@miro/domain'
import { type LLMProvider } from '@miro/providers'
import { runTurn } from '../orchestrator'
import { AGENCY_PLANNER_VERSION } from '../agency/planner'
import { routineTurn } from '../agency-turn'
import { recordedConversationReview, relationship, snapshot } from './fixtures'

const now = '2026-10-11T12:00:00.000Z'
const compiled: CompiledCharacter = { version: 1, sourceHash: 'fixture', rules: [{ id: 'respect', domain: 'value',
  statement: '상대의 선택을 존중한다.', source: { field: 'personality', start: 0, end: 14 }, origin: 'explicit', confidence: 1 }] }
async function turn(input: string, previous: Parameters<typeof relationship>[0]) {
  const llm: LLMProvider = { info: { mode: 'mock', name: 'recorded-choice', notice: 'Contract fixture' }, async generateStructured(request) {
    if (request.promptVersion === 'agency-communication-check:v5') return request.schema.parse(recordedConversationReview(request, { acceptable: true, blockIndex: 0, reason: 'none' }))
    if (request.promptVersion === AGENCY_PLANNER_VERSION) return request.schema.parse({
      appraisal: { interpretation: '사용자의 의사를 들었다.', evidenceIds: ['input'], ruleIds: ['respect'], goalCongruence: 0, valueConflict: 0,
        responsibility: 'uncertain', affectDelta: { valence: 0, arousal: 0, stress: 0, energy: 0 }, expression: { openness: 30, directness: 50 }, beliefs: [],
        relationshipChanges: [{ dimension: 'trust', delta: 1, evidenceIds: ['input'], ruleIds: ['respect'] }] },
      candidates: [{ id: 'reply', action: 'respond', description: '상대의 의사를 받아들이며 대답한다.', targetActor: 'c1', evidenceIds: ['input'], ruleIds: ['respect'],
        goalIds: [], ruleFit: [], goalFit: [], preconditions: [], uncertainty: .1, cost: .1 }], newGoals: [], goalChanges: [],
    })
    return request.schema.parse({ rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: '알겠어요. 당신의 이야기를 듣고 있어요.' }] } })
  } }
  return runTurn({ llm, snapshot: snapshot({ experienceType: 'reality', relationship: relationship(previous), turnCount: 30 }), userInput: input,
    agency: { mode: 'live', compiled, state: createAgencyState('revision', now), context: {
      sessionId: 's1', revisionId: 'revision', actor: 'c1', clock: { now, mode: 'real_time', trigger: 'user', allowOfflineAdvance: false },
      permissions: { contact: false, capabilities: ['respond', 'wait'] }, evidence: [{ id: 'input', sessionId: 's1', actor: 'user', kind: 'message',
        epistemic: 'reported', quote: input, occurredAt: now, knownTo: ['c1'] }],
    } } })
}
describe('relationship choices in the agency turn', () => {
  it('carries a real confession into the stage without double-applying the relationship delta', async () => {
    const result = await turn('좋아해', { stage: 'friend', trust: 70, attraction: 65, attachment: 60 })
    expect(result.transition.relationshipDelta).toEqual({ trust: 1, stage: 'ambiguous' })
    expect(result.semanticEvents.map(e => e.type)).toContain('confession')
  })
  it('respects breakup and permits a grounded apology to repair a conflict', async () => {
    expect((await turn('우리 그만 만나', { stage: 'lover', trust: 90, attraction: 90 })).transition.relationshipDelta.stage).toBe('distrust')
    expect((await turn('미안해', { stage: 'conflict', trust: 60 })).transition.relationshipDelta.stage).toBe('acquaintance')
  })
  it('does not promote quoted confessions or a request for space into romantic consent', async () => {
    expect((await turn('친구가 "사랑해"라고 말했어', { stage: 'friend', trust: 90, attraction: 90 })).transition.relationshipDelta.stage).toBeUndefined()
    expect((await turn('오늘은 혼자 있고 싶어', { stage: 'friend', trust: 90, attraction: 90 })).transition.relationshipDelta.stage).toBeUndefined()
  })
  it('never skips the planning step for a short request for space', () => {
    expect(routineTurn('오늘은 혼자 있고 싶어', 3, createAgencyState('revision', now), new Date(now))).toBe(false)
    expect(routineTurn('I need space today', 3, createAgencyState('revision', now), new Date(now))).toBe(false)
  })
})
