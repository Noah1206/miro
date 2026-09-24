import { reduceAgencyState, type AgencyEvidence, type AgencyGoalChange } from '@miro/domain'
import type { AgencyPlan } from '@miro/engine'

/** Called inside the transaction that actually inserts this message, never from model output. */
export function applyMessageReceipt(plan: AgencyPlan, messageId: string) {
  const action = plan.state.actions.find(a => a.id === plan.decision.id)
  if (!action) return plan.state
  const evidence: AgencyEvidence[] = (['queued', 'sent'] as const).map(status => ({
    id: status === 'sent' ? messageId : `${messageId}:queued`, sessionId: plan.context.sessionId, actor: plan.context.actor,
    quote: 'The application persisted this character message; this does not prove receipt or reading.',
    occurredAt: plan.context.clock.now, kind: 'outcome', epistemic: 'observed', knownTo: [plan.context.actor],
    actionId: action.id, goalIds: action.goalIds, outcomeStatus: status,
  }))
  const completions: AgencyGoalChange[] = plan.state.goals.filter(g => action.goalIds.includes(g.id)
    && g.status === 'active' && ['action_accepted', 'sent'].includes(g.success)).map(g => ({
      kind: 'complete', goalId: g.id, actionId: action.id, evidenceId: messageId,
    }))
  // Do not drop planner cancellation/suspension when receipts also complete goals.
  // Separate bounded transitions share one DB transaction, including their sequence increments.
  let state = plan.state
  for (let index = 0; index === 0 || index < completions.length; index += 3) {
    const reduced = reduceAgencyState(state, { expectedSequence: state.sequence,
      goals: completions.slice(index, index + 3),
      ...(index === 0 ? { outcomes: evidence.map(e => ({ actionId: action.id,
        status: e.outcomeStatus as 'queued' | 'sent', evidenceId: e.id, verified: true })) } : {}),
    }, { ...plan.context, goals: state.goals, sequence: state.sequence + 1, evidence: [...plan.context.evidence, ...evidence] })
    if (!reduced.applied || reduced.issues.length) throw new Error('agency_receipt_rejected')
    state = reduced.state
  }
  return state
}
