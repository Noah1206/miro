import { describe, expect, it } from 'vitest'
import { AIBudgetDeniedError } from '@miro/providers'
import { planAgencyDecision } from '../planner'
import { buildAgencyDecisionDirective, verifyAgencyRealization, type AgencyRealizationInput } from '../realization'
import { evidence, planProposal, recordedProvider, setupCompiled } from './fixtures'

async function realization(text = '어떤 책을 읽고 싶어?'): Promise<AgencyRealizationInput> {
  const { compiled, state, context } = await setupCompiled()
  const plan = await planAgencyDecision(recordedProvider([planProposal()]), compiled, state, context)
  return { decision: plan.decision, context: plan.context, state: plan.state, blocks: [{ type: 'dialogue', speaker: '도윤', text }] }
}
function assessment(input: AgencyRealizationInput) {
  return { decisionId: input.decision.id, aligned: true, claims: [], unsupported: [], violations: [] }
}

describe('authorized decision realization', () => {
  it('provides an explicit authorized-not-completed contract and decision ID', async () => {
    const input = await realization()
    const directive = buildAgencyDecisionDirective(input.decision)
    expect(directive).toContain(input.decision.id)
    expect(directive).toContain('NOT a sent/delivered/completed action')
    expect(directive).toContain('Do not add worldDelta')
  })

  it('accepts a grounded question after an explicit semantic review, with replay mode preserved', async () => {
    const input = await realization()
    const calls: Array<{ task?: string; promptVersion?: string; prompt: string }> = []
    const checked = await verifyAgencyRealization(recordedProvider([assessment(input)], calls), input)
    expect(checked.ok).toBe(true)
    expect(checked.providerMode).toBe('mock')
    expect(calls[0]?.promptVersion).toBe('agency-realization-check:v1')
  })

  it('rejects undeclared obvious success text even when a checker returns an empty aligned claim list', async () => {
    const input = await realization('사진을 보냈어.')
    const checked = await verifyAgencyRealization(recordedProvider([assessment(input)]), input)
    expect(checked.ok).toBe(false)
    expect(checked.issues.some(issue => issue.reason === 'undeclared_success_claim')).toBe(true)
  })

  it('refuses to treat authorization as a completed action', async () => {
    const input = await realization('사진을 보냈어.')
    input.state.actions.push({ id: 'pending-contact', type: 'contact', status: 'authorized', evidenceIds: ['message-1'], goalIds: [], createdAt: input.context.clock.now, updatedAt: input.context.clock.now })
    const claim = { blockIndex: 0, start: 0, end: input.blocks[0]!.text.length, quote: input.blocks[0]!.text,
      kind: 'action_result', evidenceIds: ['message-1'], ruleIds: [], actionIds: ['pending-contact'] }
    const checked = await verifyAgencyRealization(recordedProvider([{ ...assessment(input), claims: [claim] }]), input)
    expect(checked.ok).toBe(false)
    expect(checked.issues.some(issue => issue.reason === 'unsupported_success')).toBe(true)
  })

  it('requires a scoped attested outcome matching the completed action and status', async () => {
    const input = await realization('메시지를 보냈어.')
    input.state.actions.push({ id: 'contact-1', type: 'contact', status: 'sent', evidenceIds: ['message-1'], goalIds: [], createdAt: input.context.clock.now, updatedAt: input.context.clock.now, outcomeEvidenceId: 'receipt-1' })
    input.context.evidence.push(evidence({ id: 'receipt-1', kind: 'outcome', actionId: 'contact-1', outcomeStatus: 'sent', quote: '메시지 전송 완료' }))
    const claim = { blockIndex: 0, start: 0, end: input.blocks[0]!.text.length, quote: input.blocks[0]!.text,
      kind: 'action_result', evidenceIds: ['receipt-1'], ruleIds: [], actionIds: ['contact-1'] }
    expect((await verifyAgencyRealization(recordedProvider([{ ...assessment(input), claims: [claim] }]), input)).ok).toBe(true)
    input.context.evidence.at(-1)!.sessionId = 'someone-else'
    expect((await verifyAgencyRealization(recordedProvider([{ ...assessment(input), claims: [claim] }]), input)).ok).toBe(false)
  })

  it('does not promote reported/uncertain beliefs to observed facts', async () => {
    const input = await realization('너는 오늘 부산에 갔어.')
    input.context.evidence[0]!.epistemic = 'belief'
    const claim = { blockIndex: 0, start: 0, end: input.blocks[0]!.text.length, quote: input.blocks[0]!.text,
      kind: 'observed_fact', evidenceIds: ['message-1'], ruleIds: [], actionIds: [] }
    const checked = await verifyAgencyRealization(recordedProvider([{ ...assessment(input), claims: [claim] }]), input)
    expect(checked.ok).toBe(false)
    expect(checked.issues.some(issue => issue.reason === 'fact_not_observed')).toBe(true)
  })

  it('validates exact text spans and decision IDs rather than trusting checker approval', async () => {
    const input = await realization('내 이름은 도윤이야.')
    const claim = { blockIndex: 0, start: 0, end: 2, quote: '내 이름은 도윤이야.', kind: 'authored_fact', evidenceIds: [], ruleIds: ['identity-name'], actionIds: [] }
    const checked = await verifyAgencyRealization(recordedProvider([{ ...assessment(input), decisionId: 'invented', claims: [claim] }]), input)
    expect(checked.ok).toBe(false)
    expect(checked.issues.map(issue => issue.reason)).toEqual(expect.arrayContaining(['claim_span_mismatch', 'decision_mismatch']))
  })

  it('returns semantic rejection without retries and lets budget failures propagate', async () => {
    const input = await realization()
    const calls: Array<{ task?: string; promptVersion?: string; prompt: string }> = []
    const checked = await verifyAgencyRealization(recordedProvider([{ ...assessment(input), aligned: false, violations: ['contradicts_decision'] }], calls), input)
    expect(checked.ok).toBe(false)
    expect(calls).toHaveLength(1)
    const denied = new AIBudgetDeniedError('eval_limit')
    await expect(verifyAgencyRealization(recordedProvider([denied]), input)).rejects.toBe(denied)
  })
})
