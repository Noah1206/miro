/** Authored text is data, never executable policy or a system instruction. */
export type AuthoredDocument = { fields: Record<string, string>; explicitFields: string[]; characterId?: string; revisionId?: string }
export type AgencyRuleDomain = 'identity' | 'value' | 'boundary' | 'motive' | 'expression' | 'world'
export type AuthoredRule = {
  id: string
  domain: AgencyRuleDomain
  statement: string
  source: { field: string; start: number; end: number }
  origin: 'explicit' | 'inferred' | 'legacy-default'
  confidence: number
  /** Descriptive conditions need appraisal; they are not executable predicates. */
  conditions?: string[]
  exceptions?: string[]
  priority?: number
}
export type CompiledCharacter = {
  version: 1
  sourceHash: string
  rules: AuthoredRule[]
  unresolved?: string[]
}

/** These records must be loaded by the application, not accepted from a model as new facts. */
export type AgencyEvidence = {
  sessionId: string
  id: string
  quote: string
  actor: string
  occurredAt: string
  kind: 'authored' | 'message' | 'event' | 'outcome'
  epistemic: 'observed' | 'reported' | 'belief' | 'hypothetical' | 'retracted'
  /** Empty means no actor may use it. */
  knownTo: string[]
  /** Application-attested result correlation, absent from ordinary message evidence. */
  actionId?: string
  goalIds?: string[]
  outcomeStatus?: AgencyActionStatus
}
export type AgencyGoal = {
  id: string
  description: string
  evidenceIds: string[]
  ruleIds: string[]
  priority: number
  status: 'proposed' | 'active' | 'suspended' | 'completed' | 'abandoned' | 'cancelled' | 'expired'
  createdAt: string
  updatedAt: string
  dueAt?: string
  /** A clock is required for deadlines; fictional dates cannot trigger real notifications. */
  clock?: 'real_time' | 'narrative'
  success: 'action_accepted' | 'sent' | 'delivered' | 'answered' | 'observed_event'
  outcomeEvidenceId?: string
}
export type AgencyBelief = {
  id: string
  statement: string
  evidenceIds: string[]
  confidence: number
  status: 'active' | 'retracted'
  updatedAt: string
}
export type AgencyAffect = { valence: number; arousal: number; stress: number; energy: number }
export type AgencyExpression = { openness: number; directness: number }

export const AGENCY_ACTIONS = ['respond', 'ask', 'decline', 'defer', 'disclose', 'set_boundary', 'continue_activity', 'contact', 'cancel_commitment', 'wait'] as const
export type AgencyAction = (typeof AGENCY_ACTIONS)[number]
export type AgencyActionStatus = 'authorized' | 'queued' | 'sent' | 'delivered' | 'answered' | 'completed' | 'failed' | 'cancelled'
export type AgencyActionRecord = {
  id: string
  type: AgencyAction
  status: AgencyActionStatus
  evidenceIds: string[]
  goalIds: string[]
  createdAt: string
  updatedAt: string
  outcomeEvidenceId?: string
  /** Revokes future dispatch; already-started external work may still report a receipt. */
  cancelRequestedAt?: string
}
export type AgencyCondition =
  | { kind: 'evidence'; evidenceId: string }
  | { kind: 'goal_active'; goalId: string }
  | { kind: 'due'; at: string; clock: 'real_time' | 'narrative' }
  | { kind: 'location'; location: string }
  | { kind: 'capability'; capability: string }

export type AgencyCandidate = {
  id: string
  action: AgencyAction
  description: string
  targetActor: string
  evidenceIds: string[]
  ruleIds: string[]
  goalIds: string[]
  /** Every affinity must name a compiled rule. Scores are hypotheses, not facts. */
  ruleFit: Array<{ ruleId: string; fit: number }>
  goalFit: Array<{ goalId: string; fit: number }>
  preconditions: AgencyCondition[]
  uncertainty: number
  cost: number
  expiresAt?: string
  /** Descriptive limitations for realization, not performed world changes. */
  constraints?: string[]
}
export type AgencyClock = {
  now: string
  narrativeNow?: string
  mode: 'real_time' | 'narrative'
  trigger: 'user' | 'background' | 'outcome'
  allowOfflineAdvance: boolean
}
export type AgencyDecisionContext = {
  sessionId: string
  revisionId: string
  sequence: number
  actor: string
  compiled: CompiledCharacter
  evidence: AgencyEvidence[]
  goals: AgencyGoal[]
  clock: AgencyClock
  permissions: { contact: boolean; capabilities: string[] }
  location?: string
}
export type AgencyIssue = { field: string; reason: string }
export type AgencyDecision = {
  id: string
  sessionId: string
  revisionId: string
  sequence: number
  action: AgencyAction
  candidate: AgencyCandidate
  score: number
  decidedAt: string
  rejected: Array<{ candidateId: string; reasons: string[] }>
}
export type AgencyState = {
  version: 1
  revisionId: string
  sequence: number
  updatedAt: string
  goals: AgencyGoal[]
  beliefs: AgencyBelief[]
  affect: AgencyAffect
  expression: AgencyExpression
  actions: AgencyActionRecord[]
  /** Bounded replay guard, paired with monotonic updatedAt for evidence older than the window. */
  appraisedEvidenceIds?: string[]
  decision?: AgencyDecision
}

/** Verified only means the application matched a real provider/domain result to its action. */
export type AgencyOutcome = {
  actionId: string
  status: Exclude<AgencyActionStatus, 'authorized'>
  evidenceId: string
  verified: boolean
}
export type AgencyGoalChange =
  | { kind: 'add'; goal: AgencyGoal }
  | { kind: 'activate' | 'suspend' | 'cancel' | 'abandon' | 'expire'; goalId: string; evidenceIds: string[] }
  | { kind: 'complete'; goalId: string; actionId?: string; evidenceId: string }
export type AgencyTransition = {
  expectedSequence: number
  decision?: AgencyDecision
  goals?: AgencyGoalChange[]
  beliefs?: AgencyBelief[]
  affectDelta?: Partial<AgencyAffect>
  appraisalEvidenceIds?: string[]
  expression?: AgencyExpression
  outcomes?: AgencyOutcome[]
}
