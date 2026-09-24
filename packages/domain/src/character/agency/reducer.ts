import type { AgencyActionRecord, AgencyActionStatus, AgencyDecisionContext, AgencyGoal, AgencyIssue, AgencyState, AgencyTransition } from './types'
import { AGENCY_LIMITS, agencyEvidence, agencyGoalId, agencyUserUtterance, finiteRange, validAgencyTime, validateAgencyCandidate } from './validation'

const TERMINAL_GOALS = new Set<AgencyGoal['status']>(['completed', 'abandoned', 'cancelled', 'expired'])
const SPEECH_ACTIONS = new Set(['respond', 'ask', 'decline', 'defer', 'disclose', 'set_boundary', 'wait'])
/** A persisted message is still only sent. Retire its working copy once the goals it was carrying
 * out are closed (goals it merely cited never hold it); the database audit retains it without
 * inventing delivery. */
function retiredSentReceipt(action: AgencyActionRecord, goals: AgencyGoal[]): boolean {
  return action.status === 'sent' && (SPEECH_ACTIONS.has(action.type) || action.type === 'contact')
    && (action.fulfillsGoalIds ?? []).every(id => !goals.some(g => g.id === id && !TERMINAL_GOALS.has(g.status)))
}
const ACTION_EDGES: Record<AgencyActionStatus, AgencyActionStatus[]> = {
  authorized: ['queued', 'completed', 'failed', 'cancelled'], queued: ['sent', 'failed', 'cancelled'],
  sent: ['delivered', 'answered', 'failed'], delivered: ['answered'], answered: [], completed: [], failed: [], cancelled: [],
}
export function createAgencyState(revisionId: string, now: string): AgencyState {
  if (!revisionId || !validAgencyTime(now)) throw new Error('invalid_agency_initial_state')
  return {
    version: 1, revisionId, sequence: 0, updatedAt: now, goals: [], beliefs: [], actions: [], appraisedEvidenceIds: [],
    affect: { valence: 0, arousal: 20, stress: 20, energy: 70 }, expression: { openness: 50, directness: 50 },
  }
}

/** Pure state transition. Network/provider results must be attested by the application first. */
export function reduceAgencyState(previous: AgencyState, transition: AgencyTransition, context: AgencyDecisionContext): { state: AgencyState; issues: AgencyIssue[]; applied: boolean } {
  const issues: AgencyIssue[] = []
  const reject = (field: string, reason: string) => { issues.push({ field, reason }) }
  if (previous.version !== 1 || previous.revisionId !== context.revisionId || transition.expectedSequence !== previous.sequence
    || context.sequence !== previous.sequence + 1 || !validAgencyTime(context.clock.now) || Date.parse(context.clock.now) < Date.parse(previous.updatedAt)) {
    return { state: previous, issues: [{ field: 'state', reason: 'stale_or_invalid_state' }], applied: false }
  }
  if (transition.decision) {
    const d = transition.decision
    if (d.sessionId !== context.sessionId || d.revisionId !== context.revisionId || d.sequence !== context.sequence
      || d.action !== d.candidate.action || d.decidedAt !== context.clock.now || !Number.isFinite(d.score)) reject('decision', 'decision_scope_mismatch')
    issues.push(...validateAgencyCandidate(d.candidate, context))
    if (d.action === 'cancel_commitment' && d.candidate.goalIds.some(id => !transition.goals?.some(g => g.kind === 'cancel' && g.goalId === id))) reject('decision', 'cancellation_not_applied')
    if (issues.length) return { state: previous, issues, applied: false }
  }
  const state: AgencyState = JSON.parse(JSON.stringify(previous)) as AgencyState
  const now = context.clock.now
  const observed = (id: string) => agencyEvidence(id, context, true)
  const grounded = (ids: string[], required = true) => (!required || ids.length > 0) && ids.length <= 12
    && new Set(ids).size === ids.length && ids.every(id => Boolean(agencyEvidence(id, context)))
  const ruleIds = new Set(context.compiled.rules.map(r => r.id))

  if ((transition.goals?.length ?? 0) > AGENCY_LIMITS.changes) reject('goals', 'goal_change_limit')
  for (const change of (transition.goals ?? []).slice(0, AGENCY_LIMITS.changes)) {
    if (change.kind === 'add') {
      const g = change.goal
      if (state.goals.some(old => old.id === g.id)) { reject('goals', 'goal_exists'); continue }
      if (!g.id || g.id.length > 100 || !g.description.trim() || g.description.length > 1000 || g.status !== 'proposed'
        || !Array.from({ length: AGENCY_LIMITS.changes }, (_, i) => agencyGoalId(context.sequence, i)).includes(g.id)
        || !grounded(g.evidenceIds) || g.ruleIds.length > 12 || g.ruleIds.some(id => !ruleIds.has(id)) || !finiteRange(g.priority, 0, 1)
        || !['action_accepted', 'sent', 'delivered', 'answered', 'observed_event'].includes(g.success)
        || (g.dueAt !== undefined && (!validAgencyTime(g.dueAt) || !g.clock || !['real_time', 'narrative'].includes(g.clock)))) {
        reject('goals', 'invalid_goal'); continue
      }
      if (state.goals.length >= AGENCY_LIMITS.goals) {
        const retired = state.goals.findIndex(old => TERMINAL_GOALS.has(old.status)
          && !state.actions.some(a => a.goalIds.includes(old.id) && ['authorized', 'queued', 'sent'].includes(a.status)
            && !retiredSentReceipt(a, state.goals)))
        if (retired < 0) { reject('goals', 'active_goal_limit'); continue }
        // The application's append-only decision record retains history. Runtime keeps only
        // useful goals; sequence-owned IDs prevent an old goal being reintroduced as new.
        state.goals.splice(retired, 1)
      }
      state.goals.push({ ...g, evidenceIds: [...g.evidenceIds], ruleIds: [...g.ruleIds], createdAt: now, updatedAt: now, outcomeEvidenceId: undefined })
      continue
    }
    // Completion follows action outcomes below, so this turn's receipt may complete a goal.
    if (change.kind === 'complete') continue
    const goal = state.goals.find(g => g.id === change.goalId)
    if (!goal || TERMINAL_GOALS.has(goal.status)) { reject('goals', 'terminal_or_missing_goal'); continue }
    if (!grounded(change.evidenceIds) || (change.kind === 'cancel' && !change.evidenceIds.every(id => Boolean(observed(id) || agencyUserUtterance(id, context))))) { reject('goals', 'unverified_goal_change'); continue }
    if (change.kind === 'activate' && !['proposed', 'suspended'].includes(goal.status)) { reject('goals', 'invalid_goal_transition'); continue }
    if (change.kind === 'suspend' && goal.status !== 'active') { reject('goals', 'invalid_goal_transition'); continue }
    if (change.kind === 'expire') {
      const time = goal.clock === 'real_time' ? now : context.clock.narrativeNow
      if (!time || !goal.dueAt || Date.parse(time) < Date.parse(goal.dueAt)) { reject('goals', 'goal_not_expired'); continue }
    }
    const statuses = { activate: 'active', suspend: 'suspended', cancel: 'cancelled', abandon: 'abandoned', expire: 'expired' } as const
    goal.status = statuses[change.kind]
    goal.updatedAt = now
    goal.evidenceIds = [...new Set([...goal.evidenceIds, ...change.evidenceIds])].slice(-12)
    if (change.kind === 'cancel') {
      for (const action of state.actions) if (action.goalIds.includes(goal.id) && ['authorized', 'queued'].includes(action.status)) {
        action.cancelRequestedAt = now
        // Authorized means no external dispatch is queued. A queued request may already be
        // in flight: preserve that uncertainty until the dispatcher returns an actual result.
        if (action.status === 'authorized') action.status = 'cancelled'
        action.updatedAt = now
      }
    }
  }

  if (transition.decision) {
    const d = transition.decision
    // A cancellation in the same batch invalidates a previously selected action.
    if (d.candidate.goalIds.some(id => {
      const status = state.goals.find(g => g.id === id)?.status
      return status !== 'active' && !(d.action === 'cancel_commitment' && status === 'cancelled'
        && transition.goals?.some(g => g.kind === 'cancel' && g.goalId === id))
    })) {
      return { state: previous, issues: [...issues, { field: 'decision', reason: 'goal_changed_before_action' }], applied: false }
    }
    if (state.actions.some(a => a.id === d.id)) return { state: previous, issues: [{ field: 'decision', reason: 'duplicate_action' }], applied: false }
    // Ordinary replies have no asynchronous delivery lifecycle in this core. The application
    // commits their decision with the message; only ongoing work or work that fulfills a goal needs
    // receipts. Merely citing a goal (e.g. "I'll call you tonight") leaves it open.
    const fulfills = d.candidate.fulfillsGoalIds ?? []
    const needsReceipt = d.action !== 'cancel_commitment' && (d.action === 'contact' || d.action === 'continue_activity' || fulfills.length > 0)
    if (needsReceipt && state.actions.length >= AGENCY_LIMITS.actions) {
      const removable = state.actions.findIndex(a => retiredSentReceipt(a, state.goals)
        || (['completed', 'failed', 'cancelled', 'delivered', 'answered'].includes(a.status)
          && !a.goalIds.some(id => state.goals.some(g => g.id === id && !TERMINAL_GOALS.has(g.status)))))
      if (removable < 0) return { state: previous, issues: [...issues, { field: 'actions', reason: 'unresolved_action_limit' }], applied: false }
      state.actions.splice(removable, 1)
    }
    state.decision = d
    if (needsReceipt) state.actions.push({ id: d.id, type: d.action, status: 'authorized', evidenceIds: [...d.candidate.evidenceIds], goalIds: [...d.candidate.goalIds],
      ...(fulfills.length ? { fulfillsGoalIds: [...fulfills] } : {}), createdAt: now, updatedAt: now })
  }

  if ((transition.outcomes?.length ?? 0) > 8) reject('outcomes', 'outcome_limit')
  for (const outcome of (transition.outcomes ?? []).slice(0, 8)) {
    const action = state.actions.find(a => a.id === outcome.actionId)
    const proof = observed(outcome.evidenceId)
    if (!action || !outcome.verified || !proof || proof.kind !== 'outcome' || proof.actionId !== outcome.actionId || proof.outcomeStatus !== outcome.status) { reject('outcomes', 'unverified_outcome'); continue }
    if (action.status === outcome.status && action.outcomeEvidenceId === outcome.evidenceId) continue
    if (!ACTION_EDGES[action.status].includes(outcome.status) || (action.type === 'contact' && outcome.status === 'completed')) { reject('outcomes', 'invalid_action_lifecycle'); continue }
    action.status = outcome.status; action.updatedAt = now; action.outcomeEvidenceId = outcome.evidenceId
  }
  for (const change of (transition.goals ?? []).slice(0, AGENCY_LIMITS.changes)) {
    if (change.kind !== 'complete') continue
    const goal = state.goals.find(g => g.id === change.goalId)
    const proof = observed(change.evidenceId)
    const action = change.actionId ? state.actions.find(a => a.id === change.actionId) : undefined
    if (!goal || goal.status !== 'active' || !proof) { reject('goals', 'completion_not_observed'); continue }
    let completed = false
    if (goal.success === 'observed_event') completed = (proof.kind === 'event' || proof.kind === 'outcome') && Boolean(proof.goalIds?.includes(goal.id))
    else if (action?.fulfillsGoalIds?.includes(goal.id) && proof.actionId === action.id && proof.id === action.outcomeEvidenceId) {
      const acceptable: Record<Exclude<AgencyGoal['success'], 'observed_event'>, AgencyActionStatus[]> = {
        action_accepted: ['queued', 'sent', 'delivered', 'answered', 'completed'], sent: ['sent', 'delivered', 'answered'], delivered: ['delivered', 'answered'], answered: ['answered'],
      }
      completed = acceptable[goal.success].includes(action.status)
    }
    if (!completed) { reject('goals', 'success_condition_unmet'); continue }
    goal.status = 'completed'; goal.updatedAt = now; goal.outcomeEvidenceId = proof.id
  }

  if ((transition.beliefs?.length ?? 0) > AGENCY_LIMITS.changes) reject('beliefs', 'belief_change_limit')
  for (const belief of (transition.beliefs ?? []).slice(0, AGENCY_LIMITS.changes)) {
    if (!belief.id || belief.id.length > 100 || !belief.statement.trim() || belief.statement.length > 1000 || !grounded(belief.evidenceIds)
      || !finiteRange(belief.confidence, 0, 1) || !['active', 'retracted'].includes(belief.status)) { reject('beliefs', 'invalid_belief'); continue }
    const index = state.beliefs.findIndex(b => b.id === belief.id)
    if (index < 0 && state.beliefs.length >= AGENCY_LIMITS.beliefs) { reject('beliefs', 'belief_limit'); continue }
    const next = { ...belief, evidenceIds: [...belief.evidenceIds], confidence: Math.min(.95, belief.confidence), updatedAt: now }
    if (index < 0) state.beliefs.push(next)
    else state.beliefs[index] = next
  }
  const appraisalIds = transition.appraisalEvidenceIds ?? []
  const freshAppraisal = grounded(appraisalIds) && appraisalIds.some(id => {
    const proof = agencyEvidence(id, context)
    return proof && !previous.appraisedEvidenceIds?.includes(id) && Date.parse(proof.occurredAt) >= Date.parse(previous.updatedAt)
  })
  if (transition.affectDelta && !freshAppraisal) reject('affect', 'appraisal_requires_fresh_evidence')
  for (const [key, value] of Object.entries(freshAppraisal ? transition.affectDelta ?? {} : {})) {
    if (!['valence', 'arousal', 'stress', 'energy'].includes(key) || typeof value !== 'number' || !finiteRange(value, -15, 15)) { reject('affect', 'unbounded_affect_change'); continue }
    const k = key as keyof AgencyState['affect']
    state.affect[k] = Math.max(k === 'valence' ? -100 : 0, Math.min(100, state.affect[k] + value))
  }
  if (freshAppraisal) state.appraisedEvidenceIds = [...new Set([...(previous.appraisedEvidenceIds ?? []), ...appraisalIds])].slice(-128)
  if (transition.expression) {
    if (!finiteRange(transition.expression.openness, 0, 100) || !finiteRange(transition.expression.directness, 0, 100)) reject('expression', 'invalid_expression')
    else state.expression = { ...transition.expression }
  }
  state.sequence = context.sequence
  state.updatedAt = now
  return { state, issues, applied: true }
}
