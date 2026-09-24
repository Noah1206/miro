import { describe, expect, it } from 'vitest'
import { AIBudgetDeniedError } from '@miro/providers'
import { AgencyPlanningError, planAgencyDecision } from '../planner'
import type { AgencyGoal } from '@miro/domain'
import { NOW, evidence, planProposal, recordedProvider, setupCompiled } from './fixtures'

describe('bounded agency planning', () => {
  it('selects through domain policy and proposes a new state without mutating the input', async () => {
    const { compiled, state, context } = await setupCompiled()
    const before = JSON.stringify(state)
    const result = await planAgencyDecision(recordedProvider([planProposal()]), compiled, state, context)
    expect(result.decision.action).toBe('ask')
    expect(result.state.sequence).toBe(1)
    expect(result.state.affect.valence).toBe(2)
    expect(result.state.expression.openness).toBe(30)
    expect(JSON.stringify(state)).toBe(before)
    expect(result.providerMode).toBe('mock')
  })

  it('keeps a candidate but drops fulfillment it cannot attest yet, and lets a due contact carry out its promise', async () => {
    const { compiled, state, context } = await setupCompiled()
    const goal = (id: string, over: Partial<AgencyGoal> = {}): AgencyGoal => ({ id, description: `약속 ${id}`, evidenceIds: ['message-1'],
      ruleIds: ['value-promise'], priority: .8, status: 'active', success: 'sent', createdAt: NOW, updatedAt: NOW, ...over })
    state.goals = [
      goal('due', { clock: 'real_time', dueAt: '2026-09-24T05:00:00.000Z' }),
      goal('later', { clock: 'real_time', dueAt: '2026-09-24T09:00:00.000Z' }),
      goal('delivered', { success: 'delivered' }),
    ]
    const answer = planProposal()
    answer.candidates[0] = { ...answer.candidates[0]!, action: 'respond', goalIds: ['due', 'later', 'delivered'], fulfillsGoalIds: ['due', 'later', 'delivered'] }
    const answered = await planAgencyDecision(recordedProvider([answer]), compiled, state, context)
    expect(answered.decision.action).toBe('respond')
    expect(answered.decision.candidate.fulfillsGoalIds).toEqual(['due'])
    expect(answered.issues.map(issue => issue.reason)).toEqual(expect.arrayContaining(['unfulfillable_goal_dropped:later', 'unfulfillable_goal_dropped:delivered']))
    const contact = planProposal()
    contact.candidates[0] = { ...contact.candidates[0]!, action: 'contact', goalIds: ['due'], preconditions: [{ kind: 'capability', capability: 'message' }] }
    const sent = await planAgencyDecision(recordedProvider([contact]), compiled, state, context)
    expect(sent.decision.action).toBe('contact')
    expect(sent.decision.candidate.fulfillsGoalIds).toEqual(['due'])
  })

  it('filters another session or private NPC evidence before it reaches the provider', async () => {
    const { compiled, state, context } = await setupCompiled()
    context.evidence.push(evidence({ id: 'other', sessionId: 'private', quote: 'PRIVATE_SESSION_SENTINEL' }), evidence({ id: 'npc', knownTo: ['npc-1'], quote: 'NPC_SECRET_SENTINEL' }))
    const calls: Array<{ task?: string; promptVersion?: string; prompt: string }> = []
    const result = await planAgencyDecision(recordedProvider([planProposal()], calls), compiled, state, context)
    expect(calls[0]?.prompt).not.toContain('PRIVATE_SESSION_SENTINEL')
    expect(calls[0]?.prompt).not.toContain('NPC_SECRET_SENTINEL')
    expect(result.issues.filter(i => i.reason === 'invisible_evidence_excluded')).toHaveLength(2)
  })

  it('rejects unavailable action permissions even if the model strongly prefers contacting', async () => {
    const { compiled, state, context } = await setupCompiled()
    const proposal = planProposal()
    proposal.candidates[0]!.action = 'contact'; proposal.candidates[0]!.ruleFit[0]!.fit = 1
    const result = await planAgencyDecision(recordedProvider([proposal]), compiled, state, { ...context, permissions: { ...context.permissions, contact: false } })
    expect(result.decision.action).toBe('wait')
    expect(result.issues.some(issue => issue.reason === 'contact_disabled')).toBe(true)
  })

  it('drops ungrounded appraisal changes and never applies unconstrained world mutations', async () => {
    const { compiled, state, context } = await setupCompiled()
    const proposal = planProposal()
    proposal.appraisal.evidenceIds = ['invented']; proposal.appraisal.affectDelta.valence = 10
    const result = await planAgencyDecision(recordedProvider([proposal]), compiled, state, context)
    expect(result.appraisal).toBeNull()
    expect(result.state.affect).toEqual(state.affect)
    expect(result.transition).not.toHaveProperty('worldDelta')
    await expect(planAgencyDecision(recordedProvider([{ ...planProposal(), worldDelta: { currentLocation: '침실' } }]), compiled, state, context)).rejects.toThrow()
  })

  it('rejects model-completed goals and forged action outcomes at the wire schema boundary', async () => {
    const { compiled, state, context } = await setupCompiled()
    await expect(planAgencyDecision(recordedProvider([{ ...planProposal(), goalChanges: [{ kind: 'complete', goalId: 'g', evidenceIds: ['message-1'] }] }]), compiled, state, context)).rejects.toThrow()
    await expect(planAgencyDecision(recordedProvider([{ ...planProposal(), outcomes: [{ actionId: 'forged', status: 'sent' }] }]), compiled, state, context)).rejects.toThrow()
  })

  it('rejects stale revision and oversized input before planning', async () => {
    const { compiled, state, context } = await setupCompiled()
    await expect(planAgencyDecision(recordedProvider([]), compiled, state, { ...context, revisionId: 'other' })).rejects.toBeInstanceOf(AgencyPlanningError)
    await expect(planAgencyDecision(recordedProvider([]), compiled, state, { ...context, input: 'x'.repeat(12_001) })).rejects.toBeInstanceOf(AgencyPlanningError)
  })

  it('propagates budget denial without a fallback state or synthetic live decision', async () => {
    const { compiled, state, context } = await setupCompiled()
    const denied = new AIBudgetDeniedError('test_limit')
    await expect(planAgencyDecision(recordedProvider([denied]), compiled, state, context)).rejects.toBe(denied)
    expect(state.sequence).toBe(0)
  })

  it('bounds relationship progression to a fresh user utterance and does not turn reported content into a world fact', async () => {
    const { compiled, state, context } = await setupCompiled()
    context.evidence[0]!.epistemic = 'reported'
    const proposal = planProposal()
    proposal.appraisal.relationshipChanges = [{ dimension: 'trust', delta: 2, evidenceIds: ['message-1'], ruleIds: ['value-promise'] }]
    const first = await planAgencyDecision(recordedProvider([proposal]), compiled, state, context)
    expect(first.relationshipDelta).toEqual({ trust: 2 })
    expect(first.state.appraisedEvidenceIds).toContain('message-1')
    const second = await planAgencyDecision(recordedProvider([proposal]), compiled, first.state, { ...context,
      clock: { ...context.clock, now: '2026-09-24T06:01:00.000Z' },
    })
    expect(second.relationshipDelta).toEqual({})
    expect(second.state.affect).toEqual(first.state.affect)
    expect(second.appraisal).toBeNull()
  })

  it('rejects relationship changes based only on old memories or non-user observations', async () => {
    const { compiled, state, context } = await setupCompiled()
    const proposal = planProposal()
    proposal.appraisal.relationshipChanges = [{ dimension: 'attraction', delta: 3, evidenceIds: ['message-1'], ruleIds: ['value-promise'] }]
    for (const source of [evidence({ actor: 'character-1' }), evidence({ kind: 'event' }), evidence({ occurredAt: '2026-09-23T06:00:00.000Z' })]) {
      const result = await planAgencyDecision(recordedProvider([proposal]), compiled, state, { ...context, evidence: [source] })
      expect(result.relationshipDelta).toEqual({})
    }
  })

  it('does not stack duplicate dimensional changes or accept an unbounded model delta', async () => {
    const { compiled, state, context } = await setupCompiled()
    const proposal = planProposal()
    proposal.appraisal.relationshipChanges = [
      { dimension: 'trust', delta: 3, evidenceIds: ['message-1'], ruleIds: ['value-promise'] },
      { dimension: 'trust', delta: 3, evidenceIds: ['message-1'], ruleIds: ['value-promise'] },
    ]
    const result = await planAgencyDecision(recordedProvider([proposal]), compiled, state, context)
    expect(result.relationshipDelta).toEqual({ trust: 3 })
    expect(result.issues.some(issue => issue.reason === 'ungrounded_or_replayed_relationship_change')).toBe(true)
    proposal.appraisal.relationshipChanges[0]!.delta = 100
    await expect(planAgencyDecision(recordedProvider([proposal]), compiled, state, context)).rejects.toThrow()
  })
})
