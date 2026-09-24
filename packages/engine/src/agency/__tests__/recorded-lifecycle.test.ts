import { describe, expect, it } from 'vitest'
import { createAgencyState, type AgencyState } from '@miro/domain'
import { compileAuthoredCharacter, hashAuthoredCharacter } from '../compiler'
import { planAgencyDecision } from '../planner'
import { verifyAgencyRealization } from '../realization'
import { DOCUMENT, NOW, compileProposal, evidence, planProposal, planningContext, recordedProvider } from './fixtures'

/** Serialization boundary models save/reload; application DB/CAS integration is tested separately. */
const reload = (state: AgencyState): AgencyState => JSON.parse(JSON.stringify(state)) as AgencyState

describe('raw-authored → compiled → decision → reducer recorded evaluation', () => {
  it('retains a proposed goal through unrelated turns, activates it, then records an explicit cancellation', async () => {
    const compilation = await compileAuthoredCharacter(recordedProvider([compileProposal()]), DOCUMENT, hashAuthoredCharacter(DOCUMENT))
    let state = createAgencyState('revision-1', NOW)
    const first = planProposal()
    first.newGoals.push({ id: 'model-suggested-name', description: '함께 읽을 책 정하기', evidenceIds: ['message-1'], ruleIds: ['value-promise'], priority: .7, success: 'observed_event' })
    const firstPlan = await planAgencyDecision(recordedProvider([first]), compilation.compiled, state, planningContext())
    state = reload(firstPlan.state)
    expect(state.goals).toHaveLength(1)
    const goalId = state.goals[0]!.id
    expect(state.goals[0]!.status).toBe('proposed')

    const later = planProposal()
    later.goalChanges.push({ kind: 'activate', goalId, evidenceIds: ['message-1'] })
    const secondPlan = await planAgencyDecision(recordedProvider([later]), compilation.compiled, state, planningContext({
      clock: { now: '2026-09-24T06:01:00.000Z', mode: 'real_time', trigger: 'user', allowOfflineAdvance: false },
    }))
    state = reload(secondPlan.state)
    expect(state.goals[0]!.status).toBe('active')

    const ordinary = await planAgencyDecision(recordedProvider([planProposal()]), compilation.compiled, state, planningContext({
      input: '오늘 날씨는 어때?', clock: { now: '2026-09-24T07:00:00.000Z', mode: 'real_time', trigger: 'user', allowOfflineAdvance: false },
    }))
    state = reload(ordinary.state)
    expect(state.goals[0]).toMatchObject({ id: goalId, status: 'active', description: '함께 읽을 책 정하기' })

    const cancel = planProposal()
    cancel.goalChanges.push({ kind: 'cancel', goalId, evidenceIds: ['cancel-message'] })
    cancel.candidates[0]!.action = 'cancel_commitment'
    cancel.candidates[0]!.description = '같이 책을 고르자는 계획을 취소한다.'
    cancel.candidates[0]!.evidenceIds = ['cancel-message']
    cancel.candidates[0]!.goalIds = [goalId]
    cancel.appraisal.evidenceIds = ['cancel-message']
    const cancelContext = planningContext({
      input: '책 같이 고르는 건 취소하자.', evidence: [evidence(), evidence({ id: 'cancel-message', quote: '책 같이 고르는 건 취소하자.', occurredAt: '2026-09-24T07:01:00.000Z' })],
      clock: { now: '2026-09-24T07:01:00.000Z', mode: 'real_time', trigger: 'user', allowOfflineAdvance: false },
    })
    const cancellation = await planAgencyDecision(recordedProvider([cancel]), compilation.compiled, state, cancelContext)
    state = reload(cancellation.state)
    expect(state.goals[0]!.status).toBe('cancelled')
    expect(state.sequence).toBe(4)
    expect(state.actions).toHaveLength(0)
    expect(cancellation.providerMode).toBe('mock')
    const checked = await verifyAgencyRealization(recordedProvider([{ decisionId: cancellation.decision.id, aligned: true, claims: [], unsupported: [], violations: [] }]), {
      decision: cancellation.decision, context: cancellation.context, state, blocks: [{ type: 'dialogue', speaker: '도윤', text: '알겠어. 다른 이야기를 하자.' }],
    })
    expect(checked.ok).toBe(true)
  })
})
