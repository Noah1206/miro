import { AGENCY_ACTIONS, type AgencyCandidate, type AgencyDecisionContext, type AgencyEvidence, type AgencyIssue, type AuthoredDocument, type CompiledCharacter } from './types'

export const AGENCY_LIMITS = { rules: 64, evidence: 128, goals: 24, beliefs: 32, actions: 48, candidates: 5, changes: 3 } as const
export const validAgencyTime = (s: string): boolean => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s))
export const finiteRange = (n: number, min: number, max: number): boolean => Number.isFinite(n) && n >= min && n <= max
/** Server-owned IDs cannot be reused after a closed goal leaves the bounded working set. */
export function agencyGoalId(sequence: number, slot: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || !Number.isInteger(slot) || slot < 0 || slot >= AGENCY_LIMITS.changes) throw new Error('invalid_goal_id_coordinates')
  return `goal:${sequence}:${slot}`
}
const short = (s: string, max = 2000): boolean => typeof s === 'string' && s.trim().length > 0 && s.length <= max
const unique = (xs: string[]): boolean => new Set(xs).size === xs.length
const issue = (field: string, reason: string): AgencyIssue => ({ field, reason })

/** This proves provenance/shape, not that a model's paraphrase is semantically faithful. */
export function validateCompiledCharacter(compiled: CompiledCharacter, document: AuthoredDocument, expectedHash: string): AgencyIssue[] {
  const out: AgencyIssue[] = []
  if (compiled.version !== 1 || compiled.sourceHash !== expectedHash || !short(expectedHash, 128)) out.push(issue('sourceHash', 'revision_mismatch'))
  if (compiled.rules.length > AGENCY_LIMITS.rules || !unique(compiled.rules.map(r => r.id))) out.push(issue('rules', 'invalid_count_or_duplicate'))
  const domains = ['identity', 'value', 'boundary', 'motive', 'expression', 'world']
  for (const rule of compiled.rules) {
    const field = `rules.${rule.id}`
    const source = document.fields[rule.source.field]
    if (!short(rule.id, 100) || !short(rule.statement) || !domains.includes(rule.domain) || !['explicit', 'inferred', 'legacy-default'].includes(rule.origin)) out.push(issue(field, 'invalid_rule'))
    if (!finiteRange(rule.confidence, 0, 1) || (rule.priority !== undefined && !finiteRange(rule.priority, 0, 1))) out.push(issue(field, 'invalid_weight'))
    const spanValid = typeof source === 'string' && Number.isInteger(rule.source.start) && Number.isInteger(rule.source.end)
      && rule.source.start >= 0 && rule.source.end > rule.source.start && rule.source.end <= source.length
    if (!spanValid) out.push(issue(field, 'invalid_source_span'))
    else if (rule.origin !== 'inferred' && rule.statement.trim() !== source.slice(rule.source.start, rule.source.end).trim()) out.push(issue(field, 'explicit_statement_must_match_source'))
    if (rule.origin === 'inferred' && ['identity', 'world', 'boundary'].includes(rule.domain)) out.push(issue(field, 'inference_cannot_create_canon'))
    for (const list of [rule.conditions ?? [], rule.exceptions ?? []]) if (list.length > 8 || list.some(s => !short(s, 400))) out.push(issue(field, 'unbounded_condition'))
  }
  if ((compiled.unresolved?.length ?? 0) > 12 || compiled.unresolved?.some(s => !short(s, 400))) out.push(issue('unresolved', 'unbounded_issues'))
  return out
}

/** A model can reference only visible evidence loaded by the application for this decision. */
export function agencyEvidence(id: string, c: AgencyDecisionContext, observedOnly = false): AgencyEvidence | undefined {
  const matches = c.evidence.filter(e => e.id === id)
  if (matches.length !== 1) return undefined
  const e = matches[0]!
  if (e.sessionId !== c.sessionId || !e.knownTo.includes(c.actor) || e.epistemic === 'retracted' || e.epistemic === 'hypothetical'
    || !short(e.quote, 8000) || !validAgencyTime(e.occurredAt) || Date.parse(e.occurredAt) > Date.parse(c.clock.now)) return undefined
  if (observedOnly && e.epistemic !== 'observed') return undefined
  return e
}

/** Observing that the user said something does not verify the world facts inside their words. */
export function agencyUserUtterance(id: string, context: AgencyDecisionContext): AgencyEvidence | undefined {
  const evidence = agencyEvidence(id, context)
  return evidence?.kind === 'message' && evidence.actor === 'user' && ['observed', 'reported'].includes(evidence.epistemic) ? evidence : undefined
}

export function validateAgencyCandidate(a: AgencyCandidate, c: AgencyDecisionContext): AgencyIssue[] {
  const out: AgencyIssue[] = []
  if (!short(c.sessionId, 100) || !short(c.revisionId, 128) || !Number.isSafeInteger(c.sequence) || c.sequence < 1
    || !validAgencyTime(c.clock.now) || c.evidence.length > AGENCY_LIMITS.evidence || c.goals.length > AGENCY_LIMITS.goals) out.push(issue('context', 'invalid_context'))
  if (!short(a.id, 100) || !short(a.description, 1000) || !AGENCY_ACTIONS.includes(a.action)) out.push(issue('candidate', 'invalid_action'))
  // A user is a conversation target, never an actor the character may control.
  if (a.targetActor !== c.actor) out.push(issue('targetActor', 'cannot_control_other_actor'))
  for (const [field, ids] of [['evidenceIds', a.evidenceIds], ['ruleIds', a.ruleIds], ['goalIds', a.goalIds]] as const) {
    if (ids.length > 12 || !unique(ids)) out.push(issue(field, 'unbounded_or_duplicate_refs'))
  }
  if (a.action !== 'wait' && !a.evidenceIds.length && !a.ruleIds.length && !a.goalIds.length) out.push(issue('evidenceIds', 'ungrounded_action'))
  for (const id of a.evidenceIds) if (!agencyEvidence(id, c)) out.push(issue('evidenceIds', `unavailable_evidence:${id}`))
  const rules = new Map(c.compiled.rules.map(r => [r.id, r]))
  const goals = new Map(c.goals.map(g => [g.id, g]))
  for (const id of a.ruleIds) if (!rules.has(id)) out.push(issue('ruleIds', `unknown_rule:${id}`))
  for (const id of a.goalIds) if (!goals.has(id) || goals.get(id)!.status !== 'active') out.push(issue('goalIds', `inactive_goal:${id}`))
  if (a.action === 'cancel_commitment' && a.goalIds.length === 0) out.push(issue('goalIds', 'cancellation_requires_goal'))
  if (!finiteRange(a.uncertainty, 0, 1) || !finiteRange(a.cost, 0, 1)) out.push(issue('score', 'invalid_score'))
  if (a.ruleFit.length > 12 || !unique(a.ruleFit.map(f => f.ruleId)) || a.goalFit.length > 12 || !unique(a.goalFit.map(f => f.goalId))) out.push(issue('fit', 'unbounded_or_duplicate_fit'))
  for (const fit of a.ruleFit) {
    const rule = rules.get(fit.ruleId)
    if (!rule || !a.ruleIds.includes(fit.ruleId) || !finiteRange(fit.fit, -1, 1)) out.push(issue('ruleFit', 'invalid_rule_fit'))
    else if (rule.origin !== 'inferred' && ['identity', 'boundary', 'world'].includes(rule.domain) && fit.fit < 0) out.push(issue('ruleFit', 'explicit_constraint_conflict'))
  }
  for (const fit of a.goalFit) if (!a.goalIds.includes(fit.goalId) || !finiteRange(fit.fit, -1, 1)) out.push(issue('goalFit', 'invalid_goal_fit'))
  if (a.expiresAt && (!validAgencyTime(a.expiresAt) || Date.parse(a.expiresAt) <= Date.parse(c.clock.now))) out.push(issue('expiresAt', 'expired_or_invalid'))
  if ((a.constraints?.length ?? 0) > 8 || a.constraints?.some(s => !short(s, 400))) out.push(issue('constraints', 'unbounded_constraints'))
  if (a.action === 'contact' && !c.permissions.contact) out.push(issue('permissions', 'contact_disabled'))
  if (!c.permissions.capabilities.includes(a.action)) out.push(issue('permissions', 'action_executor_unavailable'))
  if (a.action === 'continue_activity' && c.clock.trigger === 'background' && c.clock.mode === 'narrative' && !c.clock.allowOfflineAdvance) out.push(issue('clock', 'narrative_clock_paused'))
  if (a.preconditions.length > 12) out.push(issue('preconditions', 'too_many_preconditions'))
  for (const p of a.preconditions) {
    switch (p.kind) {
      case 'evidence': if (!a.evidenceIds.includes(p.evidenceId) || !agencyEvidence(p.evidenceId, c, true)) out.push(issue('preconditions', 'evidence_not_observed')); break
      case 'goal_active': if (!a.goalIds.includes(p.goalId) || goals.get(p.goalId)?.status !== 'active') out.push(issue('preconditions', 'goal_not_active')); break
      case 'location': if (p.location !== c.location) out.push(issue('preconditions', 'location_mismatch')); break
      case 'capability': if (!c.permissions.capabilities.includes(p.capability)) out.push(issue('preconditions', 'capability_unavailable')); break
      case 'due': {
        const time = p.clock === 'real_time' ? c.clock.now : c.clock.narrativeNow
        if (!time || !validAgencyTime(p.at) || !validAgencyTime(time) || Date.parse(time) < Date.parse(p.at)) out.push(issue('preconditions', 'not_due'))
        if (p.clock === 'narrative' && c.clock.trigger === 'background' && !c.clock.allowOfflineAdvance) out.push(issue('preconditions', 'narrative_clock_paused'))
        break
      }
      default: out.push(issue('preconditions', 'unknown_precondition'))
    }
  }
  return out
}
