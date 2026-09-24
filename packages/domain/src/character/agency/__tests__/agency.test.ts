import { describe, expect, it } from 'vitest'
import { agencyEvidence, agencyGoalId, agencyUserUtterance, createAgencyState, reduceAgencyState, selectAgencyDecision, validateAgencyCandidate, validateCompiledCharacter } from '..'
import type { AgencyCandidate, AgencyDecisionContext, AgencyEvidence, AgencyGoal, AgencyState, CompiledCharacter } from '../types'

const now = '2026-09-24T12:00:00.000Z'
const field = '약속을 우선한다. 감정이 상하면 거리를 둔다.'
const compiled: CompiledCharacter = { version: 1, sourceHash: 'hash', rules: [
  { id: 'promise', domain: 'value', statement: '약속을 우선한다.', source: { field: 'personality', start: 0, end: 9 }, origin: 'explicit', confidence: 1, priority: .9 },
  { id: 'distance', domain: 'value', statement: '감정이 상하면 거리를 둔다.', source: { field: 'personality', start: 10, end: field.length }, origin: 'explicit', confidence: 1, priority: .2 },
] }
const evidence = (id = 'message'): AgencyEvidence => ({ id, sessionId: 'session', quote: '오늘 저녁에는 연락하기로 했지.', actor: 'user', occurredAt: now, kind: 'message', epistemic: 'observed', knownTo: ['character'] })
const context = (overrides: Partial<AgencyDecisionContext> = {}): AgencyDecisionContext => ({
  sessionId: 'session', revisionId: 'revision', sequence: 1, actor: 'character', compiled, evidence: [evidence()], goals: [],
  clock: { now, mode: 'real_time', trigger: 'user', allowOfflineAdvance: false }, permissions: { contact: true, capabilities: ['contact', 'respond', 'ask', 'wait', 'cancel_commitment', 'continue_activity', 'message'] }, ...overrides,
})
const candidate = (overrides: Partial<AgencyCandidate> = {}): AgencyCandidate => ({
  id: 'contact', action: 'contact', description: '약속한 짧은 연락을 보낸다.', targetActor: 'character', evidenceIds: ['message'], ruleIds: ['promise'], goalIds: [],
  ruleFit: [{ ruleId: 'promise', fit: 1 }], goalFit: [], preconditions: [], uncertainty: .1, cost: .1, ...overrides,
})
const goal = (overrides: Partial<AgencyGoal> = {}): AgencyGoal => ({
  id: 'promise-goal', description: '약속한 연락이 상대에게 전달된다.', evidenceIds: ['message'], ruleIds: ['promise'], priority: .8,
  status: 'active', createdAt: now, updatedAt: now, success: 'delivered', ...overrides,
})
const initial = (): AgencyState => ({ ...createAgencyState('revision', now), goals: [goal()] })
function receipt(id: string, status: AgencyEvidence['outcomeStatus'], actionId: string): AgencyEvidence {
  return { ...evidence(id), kind: 'outcome', actor: 'system', actionId, outcomeStatus: status }
}

describe('agency provenance and candidate contracts', () => {
  it('keeps authored source spans exact and refuses inferred identity facts', () => {
    expect(validateCompiledCharacter(compiled, { fields: { personality: field }, explicitFields: ['personality'] }, 'hash')).toEqual([])
    const wrong = { ...compiled, rules: [{ ...compiled.rules[0]!, statement: '절대 사과하지 않는다.' }] }
    expect(validateCompiledCharacter(wrong, { fields: { personality: field }, explicitFields: [] }, 'hash').map(i => i.reason)).toContain('explicit_statement_must_match_source')
    expect(validateCompiledCharacter({ ...compiled, rules: [{ ...compiled.rules[0]!, origin: 'inferred', domain: 'identity' }] }, { fields: { personality: field }, explicitFields: [] }, 'hash').map(i => i.reason)).toContain('inference_cannot_create_canon')
  })
  it('rejects cross-session, invented, private and hypothetical evidence', () => {
    for (const ref of [undefined, { ...evidence(), sessionId: 'someone-else' }, { ...evidence(), knownTo: ['npc'] }, { ...evidence(), epistemic: 'hypothetical' as const }]) {
      expect(validateAgencyCandidate(candidate(), context({ evidence: ref ? [ref] : [] })).map(i => i.reason)).toContain('unavailable_evidence:message')
    }
  })
  it('permits a belief as a tentative reason but not proof of a performed event', () => {
    const c = context({ evidence: [{ ...evidence(), epistemic: 'belief' }] })
    expect(validateAgencyCandidate(candidate(), c)).toEqual([])
    expect(validateAgencyCandidate(candidate({ preconditions: [{ kind: 'evidence', evidenceId: 'message' }] }), c).map(i => i.reason)).toContain('evidence_not_observed')
  })
  it('cannot control the user, spend nonexistent capabilities, or override contact OFF', () => {
    const c = context({ permissions: { contact: false, capabilities: [] } })
    const issues = validateAgencyCandidate(candidate({ targetActor: 'user', preconditions: [{ kind: 'capability', capability: 'video' }] }), c)
    expect(issues.map(i => i.reason)).toEqual(expect.arrayContaining(['cannot_control_other_actor', 'contact_disabled', 'capability_unavailable']))
  })
  it('blocks actions with no executor even when the model omits capability preconditions', () => {
    const c = context({ permissions: { contact: true, capabilities: ['respond', 'wait'] } })
    expect(validateAgencyCandidate(candidate({ action: 'continue_activity', preconditions: [] }), c).map(i => i.reason)).toContain('action_executor_unavailable')
    expect(validateAgencyCandidate(candidate({ action: 'contact', preconditions: [] }), c).map(i => i.reason)).toContain('action_executor_unavailable')
  })
  it('chooses differently when the priority of authored values changes, not when a name changes', () => {
    const contact = candidate({ ruleIds: ['promise', 'distance'], ruleFit: [{ ruleId: 'promise', fit: 1 }, { ruleId: 'distance', fit: -1 }] })
    const wait = candidate({ id: 'wait', action: 'wait', ruleIds: ['promise', 'distance'], ruleFit: [{ ruleId: 'promise', fit: -1 }, { ruleId: 'distance', fit: 1 }] })
    expect(selectAgencyDecision([contact, wait], context()).action).toBe('contact')
    const other = { ...compiled, rules: compiled.rules.map(r => ({ ...r, priority: r.id === 'promise' ? .2 : .9 })) }
    expect(selectAgencyDecision([contact, wait], context({ compiled: other })).action).toBe('wait')
    expect(selectAgencyDecision([contact, wait], context({ actor: 'renamed-character' })).action).toBe('wait') // mismatched actor references are rejected
    expect(selectAgencyDecision([contact, wait].map(a => ({ ...a, targetActor: 'renamed-character' })), context({ actor: 'renamed-character', evidence: [{ ...evidence(), knownTo: ['renamed-character'] }] })).action).toBe('contact')
  })
  it('does not let a high score buy out an explicit boundary', () => {
    const c = context({ compiled: { ...compiled, rules: [{ ...compiled.rules[0]!, domain: 'boundary' }] } })
    const d = selectAgencyDecision([candidate({ ruleFit: [{ ruleId: 'promise', fit: -1 }], uncertainty: 0, cost: 0 })], c)
    expect(d.action).toBe('wait')
    expect(d.rejected[0]?.reasons).toContain('explicit_constraint_conflict')
  })
  it('does not award a candidate extra score just for citing more equally relevant rules', () => {
    const rules = Array.from({ length: 6 }, (_, i) => ({ ...compiled.rules[0]!, id: `rule-${i}`, priority: .5 }))
    const c = context({ compiled: { ...compiled, rules } })
    const one = candidate({ id: 'a-one', ruleIds: ['rule-0'], ruleFit: [{ ruleId: 'rule-0', fit: 1 }] })
    const many = candidate({ id: 'b-many', ruleIds: rules.map(r => r.id), ruleFit: rules.map(r => ({ ruleId: r.id, fit: 1 })) })
    expect(selectAgencyDecision([many], c).score).toBe(selectAgencyDecision([one], c).score)
  })
  it('honors due times and paused narrative clocks without advancing them from wall time', () => {
    const c = context({ clock: { now, mode: 'narrative', trigger: 'background', allowOfflineAdvance: false, narrativeNow: '2020-01-01T18:00:00.000Z' } })
    const a = candidate({ action: 'continue_activity', preconditions: [{ kind: 'due', clock: 'narrative', at: '2020-01-02T18:00:00.000Z' }] })
    expect(validateAgencyCandidate(a, c).map(i => i.reason)).toEqual(expect.arrayContaining(['not_due', 'narrative_clock_paused']))
  })
})

describe('persistent agency state', () => {
  it('preserves goals across unrelated turns and keeps feeling independent of outward expression', () => {
    const result = reduceAgencyState(initial(), { expectedSequence: 0, appraisalEvidenceIds: ['message'], affectDelta: { valence: -12, stress: 10 }, expression: { openness: 5, directness: 10 } }, context({ goals: initial().goals }))
    expect(result.applied).toBe(true)
    expect(result.state.goals).toEqual(initial().goals)
    expect(result.state.affect.valence).toBe(-12)
    expect(result.state.expression.openness).toBe(5)
    const next = reduceAgencyState(result.state, { expectedSequence: 1, expression: { openness: 90, directness: 95 } }, context({ sequence: 2, goals: result.state.goals }))
    expect(next.state.affect).toEqual(result.state.affect)
  })
  it('does not repeatedly apply the same event or replay old evidence after the bounded ledger rotates', () => {
    let state = initial()
    const first = reduceAgencyState(state, { expectedSequence: 0, appraisalEvidenceIds: ['message'], affectDelta: { stress: 10 } }, context({ goals: state.goals }))
    expect(first.state.affect.stress).toBe(30)
    state = first.state
    const repeated = reduceAgencyState(state, { expectedSequence: 1, appraisalEvidenceIds: ['message'], affectDelta: { stress: 10 } }, context({ sequence: 2, goals: state.goals }))
    expect(repeated.state.affect.stress).toBe(30)
    const later = { ...repeated.state, appraisedEvidenceIds: [], updatedAt: '2026-09-24T13:00:00.000Z' }
    const old = reduceAgencyState(later, { expectedSequence: 2, appraisalEvidenceIds: ['message'], affectDelta: { stress: 10 } }, context({ sequence: 3, goals: later.goals, clock: { now: '2026-09-24T14:00:00.000Z', mode: 'real_time', trigger: 'user', allowOfflineAdvance: false } }))
    expect(old.state.affect.stress).toBe(30)
    expect(old.issues.map(i => i.reason)).toContain('appraisal_requires_fresh_evidence')
  })
  it('does not accumulate unresolved delivery actions from ordinary conversation over 100 turns', () => {
    let state = initial()
    for (let i = 0; i < 100; i++) {
      const c = context({ sequence: state.sequence + 1, goals: state.goals })
      const decision = selectAgencyDecision([candidate({ action: 'respond' })], c)
      const result = reduceAgencyState(state, { expectedSequence: state.sequence, decision }, c)
      expect(result.applied).toBe(true)
      state = result.state
    }
    expect(state.sequence).toBe(100)
    expect(state.actions).toEqual([])
    expect(state.goals[0]?.status).toBe('active')
  })
  it('cancellation survives future turns and cannot reactivate through model proposals', () => {
    const result = reduceAgencyState(initial(), { expectedSequence: 0, goals: [{ kind: 'cancel', goalId: 'promise-goal', evidenceIds: ['message'] }] }, context({ goals: initial().goals }))
    expect(result.state.goals[0]?.status).toBe('cancelled')
    const next = reduceAgencyState(result.state, { expectedSequence: 1, goals: [{ kind: 'activate', goalId: 'promise-goal', evidenceIds: ['message'] }] }, context({ sequence: 2, goals: result.state.goals }))
    expect(next.state.goals[0]?.status).toBe('cancelled')
    expect(next.issues[0]?.reason).toBe('terminal_or_missing_goal')
    expect(selectAgencyDecision([candidate({ goalIds: ['promise-goal'] })], context({ sequence: 3, goals: next.state.goals })).action).toBe('wait')
  })
  it('accepts a reported user cancellation as an utterance, without verifying its world claims', () => {
    const state = initial()
    const c = context({ goals: state.goals, evidence: [{ ...evidence(), quote: '오늘 약속 취소할게. 도시가 사라졌어.', epistemic: 'reported' }] })
    expect(agencyUserUtterance('message', c)).toBeDefined()
    expect(agencyEvidence('message', c, true)).toBeUndefined()
    const result = reduceAgencyState(state, { expectedSequence: 0, goals: [{ kind: 'cancel', goalId: 'promise-goal', evidenceIds: ['message'] }] }, c)
    expect(result.state.goals[0]?.status).toBe('cancelled')
    expect(c.evidence[0]?.epistemic).toBe('reported')
    const forged = { ...c, evidence: [{ ...c.evidence[0]!, actor: 'npc' }] }
    expect(reduceAgencyState(state, { expectedSequence: 0, goals: [{ kind: 'cancel', goalId: 'promise-goal', evidenceIds: ['message'] }] }, forged).state.goals[0]?.status).toBe('active')
  })
  it('rotates closed goals out of the bounded working set and prevents recycled IDs', () => {
    const state = initial()
    state.sequence = 24
    state.goals = Array.from({ length: 24 }, (_, i) => goal({ id: agencyGoalId(i + 1, 0), status: 'cancelled' }))
    const nextGoal = goal({ id: agencyGoalId(25, 0), status: 'proposed' })
    const c = context({ sequence: 25, goals: state.goals })
    const added = reduceAgencyState(state, { expectedSequence: 24, goals: [{ kind: 'add', goal: nextGoal }] }, c)
    expect(added.issues).toEqual([])
    expect(added.state.goals).toHaveLength(24)
    expect(added.state.goals.some(g => g.id === agencyGoalId(1, 0))).toBe(false)
    const recycled = reduceAgencyState(added.state, { expectedSequence: 25, goals: [{ kind: 'add', goal: goal({ id: agencyGoalId(1, 0), status: 'proposed' }) }] }, context({ sequence: 26, goals: added.state.goals }))
    expect(recycled.issues.map(i => i.reason)).toContain('invalid_goal')
    expect(recycled.state.goals.some(g => g.id === agencyGoalId(1, 0))).toBe(false)
  })
  it('can choose cancellation and apply it atomically without invalidating its own selected goal', () => {
    const state = initial()
    const c = context({ goals: state.goals })
    const decision = selectAgencyDecision([candidate({ action: 'cancel_commitment', goalIds: ['promise-goal'] })], c)
    const missing = reduceAgencyState(state, { expectedSequence: 0, decision }, c)
    expect(missing.applied).toBe(false)
    expect(missing.issues[0]?.reason).toBe('cancellation_not_applied')
    const cancelled = reduceAgencyState(state, { expectedSequence: 0, decision, goals: [{ kind: 'cancel', goalId: 'promise-goal', evidenceIds: ['message'] }] }, c)
    expect(cancelled.applied).toBe(true)
    expect(cancelled.state.goals[0]?.status).toBe('cancelled')
    expect(cancelled.state.actions).toEqual([])
  })
  it('retires completed reply receipts without inventing delivery or blocking future goals', () => {
    const state = initial()
    state.sequence = 100
    state.goals = Array.from({ length: 24 }, (_, i) => goal({ id: agencyGoalId(i + 1, 0), status: 'completed', success: 'sent' }))
    state.actions = Array.from({ length: 48 }, (_, i) => ({ id: `old-reply:${i}`, type: 'respond', status: 'sent',
      evidenceIds: ['message'], goalIds: [state.goals[i % 24]!.id], createdAt: now, updatedAt: now }))
    const added = reduceAgencyState(state, { expectedSequence: 100,
      goals: [{ kind: 'add', goal: goal({ id: agencyGoalId(101, 0), status: 'proposed' }) }],
    }, context({ sequence: 101, goals: state.goals }))
    expect(added.issues).toEqual([])
    expect(added.state.goals).toHaveLength(24)
    added.state.goals.at(-1)!.status = 'active'
    const c = context({ sequence: 102, goals: added.state.goals })
    const decision = selectAgencyDecision([candidate({ action: 'respond', goalIds: [agencyGoalId(101, 0)] })], c)
    const next = reduceAgencyState(added.state, { expectedSequence: 101, decision }, c)
    expect(next.applied).toBe(true)
    expect(next.issues).toEqual([])
    expect(next.state.actions).toHaveLength(48)
    expect(next.state.actions.filter(a => a.id !== decision.id).every(a => a.status === 'sent')).toBe(true)
    // A contact linked to an active delivery-dependent goal cannot use this exception.
    added.state.actions = added.state.actions.map(a => ({ ...a, type: 'contact', goalIds: [agencyGoalId(101, 0)] }))
    expect(reduceAgencyState(added.state, { expectedSequence: 101, decision }, c).issues.map(i => i.reason)).toContain('unresolved_action_limit')
  })
  it('keeps proactive messages working beyond 48 sent receipts without claiming they were read', () => {
    const state = createAgencyState('revision', now)
    state.actions = Array.from({ length: 48 }, (_, i) => ({ id: `old-contact:${i}`, type: 'contact', status: 'sent',
      evidenceIds: ['message'], goalIds: [], createdAt: now, updatedAt: now }))
    const c = context()
    const decision = selectAgencyDecision([candidate()], c)
    const next = reduceAgencyState(state, { expectedSequence: 0, decision }, c)
    expect(next.applied).toBe(true)
    expect(next.issues).toEqual([])
    expect(next.state.actions).toHaveLength(48)
    expect(next.state.actions.filter(a => a.id !== decision.id).every(a => a.status === 'sent')).toBe(true)
    state.actions = state.actions.map(a => ({ ...a, status: 'queued' }))
    expect(reduceAgencyState(state, { expectedSequence: 0, decision }, c).issues.map(i => i.reason)).toContain('unresolved_action_limit')
  })
  it('revokes queued dispatch without pretending an already in-flight delivery was recalled', () => {
    const state = initial()
    state.actions = [{ id: 'in-flight', type: 'contact', status: 'queued', evidenceIds: ['message'], goalIds: ['promise-goal'], createdAt: now, updatedAt: now }]
    const cancelled = reduceAgencyState(state, { expectedSequence: 0, goals: [{ kind: 'cancel', goalId: 'promise-goal', evidenceIds: ['message'] }] }, context({ goals: state.goals })).state
    expect(cancelled.actions[0]?.cancelRequestedAt).toBe(now)
    expect(cancelled.actions[0]?.status).toBe('queued')
    const sent = receipt('late-sent', 'sent', 'in-flight')
    const late = reduceAgencyState(cancelled, { expectedSequence: 1, outcomes: [{ actionId: 'in-flight', status: 'sent', evidenceId: sent.id, verified: true }] }, context({ sequence: 2, goals: cancelled.goals, evidence: [sent] }))
    expect(late.state.actions[0]?.status).toBe('sent')
    expect(late.state.goals[0]?.status).toBe('cancelled')
  })
  it('rejects stale sequence/revision without mutating the previous state', () => {
    const old = initial()
    const result = reduceAgencyState(old, { expectedSequence: 4, affectDelta: { stress: 5 } }, context({ goals: old.goals }))
    expect(result.applied).toBe(false)
    expect(result.state).toBe(old)
    expect(old.affect.stress).toBe(20)
  })
  it('does not turn an unverified model claim into a successful action', () => {
    const c = context({ goals: initial().goals })
    const d = selectAgencyDecision([candidate({ goalIds: ['promise-goal'] })], c)
    const started = reduceAgencyState(initial(), { expectedSequence: 0, decision: d }, c).state
    const forged = reduceAgencyState(started, { expectedSequence: 1, outcomes: [{ actionId: d.id, status: 'delivered', evidenceId: 'message', verified: true }] }, context({ sequence: 2, goals: started.goals }))
    expect(forged.state.actions[0]?.status).toBe('authorized')
    expect(forged.state.goals[0]?.status).toBe('active')
    expect(forged.issues[0]?.reason).toBe('unverified_outcome')
  })
  it('queued is not delivered: completion requires ordered, correlated actual receipts', () => {
    let state = initial()
    let c = context({ goals: state.goals })
    const decision = selectAgencyDecision([candidate({ goalIds: ['promise-goal'] })], c)
    state = reduceAgencyState(state, { expectedSequence: 0, decision }, c).state
    const apply = (status: 'queued' | 'sent' | 'delivered', complete = false) => {
      const proof = receipt(status, status, decision.id)
      c = context({ sequence: state.sequence + 1, goals: state.goals, evidence: [evidence(), proof] })
      const result = reduceAgencyState(state, { expectedSequence: state.sequence, outcomes: [{ actionId: decision.id, status, evidenceId: proof.id, verified: true }],
        goals: complete ? [{ kind: 'complete', goalId: 'promise-goal', actionId: decision.id, evidenceId: proof.id }] : [] }, c)
      state = result.state
      return result
    }
    apply('queued', true)
    expect(state.goals[0]?.status).toBe('active')
    expect(apply('delivered', true).issues.map(i => i.reason)).toContain('invalid_action_lifecycle')
    expect(state.actions[0]?.status).toBe('queued')
    apply('sent', true)
    expect(state.goals[0]?.status).toBe('active')
    apply('delivered', true)
    expect(state.goals[0]?.status).toBe('completed')
  })
  it('refuses an unrelated real event as evidence of goal completion', () => {
    const state = { ...initial(), goals: [goal({ success: 'observed_event' })] }
    const c = context({ goals: state.goals, evidence: [{ ...evidence(), kind: 'event', goalIds: ['some-other-goal'] }] })
    const result = reduceAgencyState(state, { expectedSequence: 0, goals: [{ kind: 'complete', goalId: 'promise-goal', evidenceId: 'message' }] }, c)
    expect(result.state.goals[0]?.status).toBe('active')
    expect(result.issues[0]?.reason).toBe('success_condition_unmet')
  })
})
