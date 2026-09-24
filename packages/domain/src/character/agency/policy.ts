import type { AgencyCandidate, AgencyDecision, AgencyDecisionContext } from './types'
import { AGENCY_LIMITS, validateAgencyCandidate } from './validation'

/** Score only valid candidates. Character rules are cited inputs, never a universal romance script. */
function score(a: AgencyCandidate, c: AgencyDecisionContext): number {
  const rules = new Map(c.compiled.rules.map(r => [r.id, r]))
  const goals = new Map(c.goals.map(g => [g.id, g]))
  const scoredRules = a.ruleFit.filter(f => ['value', 'motive', 'expression'].includes(rules.get(f.ruleId)!.domain))
  const ruleScore = scoredRules.reduce((sum, f) => {
    const rule = rules.get(f.ruleId)!
    const authority = rule.origin === 'inferred' ? .25 : 1
    return sum + f.fit * (rule.priority ?? .5) * authority
  }, 0) / Math.max(1, scoredRules.length)
  const goalScore = a.goalFit.reduce((sum, f) => sum + f.fit * (goals.get(f.goalId)?.priority ?? 0), 0) / Math.max(1, a.goalFit.length)
  return ruleScore + goalScore - a.uncertainty - .25 * a.cost
}

/** Stable tie breaking supports replay; variation should be evaluated before it is introduced. */
export function selectAgencyDecision(candidates: AgencyCandidate[], context: AgencyDecisionContext): AgencyDecision {
  const rejected: AgencyDecision['rejected'] = []
  const valid: Array<{ candidate: AgencyCandidate; score: number }> = []
  const ids = new Set<string>()
  for (const [index, candidate] of candidates.entries()) {
    const reasons = validateAgencyCandidate(candidate, context).map(i => i.reason)
    if (index >= AGENCY_LIMITS.candidates) reasons.push('candidate_limit')
    if (ids.has(candidate.id)) reasons.push('duplicate_candidate_id')
    ids.add(candidate.id)
    if (reasons.length) rejected.push({ candidateId: candidate.id, reasons })
    else valid.push({ candidate, score: score(candidate, context) })
  }
  valid.sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
  const winner = valid[0]
  const candidate: AgencyCandidate = winner?.candidate ?? {
    id: 'agency-wait', action: 'wait', description: 'No grounded, permitted action is available.', targetActor: context.actor,
    evidenceIds: [], ruleIds: [], goalIds: [], ruleFit: [], goalFit: [], preconditions: [], uncertainty: 0, cost: 0,
    constraints: ['Do not claim that an action was performed.'],
  }
  return {
    id: `${context.sessionId}:${context.revisionId}:${context.sequence}`, sessionId: context.sessionId,
    revisionId: context.revisionId, sequence: context.sequence, action: candidate.action, candidate,
    score: winner?.score ?? 0, decidedAt: context.clock.now, rejected,
  }
}
