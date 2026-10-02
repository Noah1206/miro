import { describe, expect, it } from 'vitest'
import { AIBudgetDeniedError } from '@miro/providers'
import { planAgencyDecision } from '../planner'
import { buildAgencyDecisionDirective, verifyAgencyRealization, type AgencyRealizationInput } from '../realization'
import { evidence, planProposal, recordedProvider, setupCompiled } from './fixtures'

/** review: 이 턴에 약속 변화가 있다고 두어 의미 검토가 돌게 한다(검토 자체를 보는 시험). false 면 위험 판정을 그대로 따른다. */
async function realization(text = '어떤 책을 읽고 싶어?', review = true): Promise<AgencyRealizationInput> {
  const { compiled, state, context } = await setupCompiled()
  const plan = await planAgencyDecision(recordedProvider([planProposal()]), compiled, state, context)
  return { decision: plan.decision, context: plan.context, state: plan.state, blocks: [{ type: 'dialogue', speaker: '도윤', text }], commitmentChanges: review ? 1 : 0 }
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
    expect(calls[0]?.promptVersion).toBe('agency-realization-check:v5')
  })

  it('skips the model review for a plain reply with no action, promise or completion claim', async () => {
    const input = await realization('어떤 책을 읽고 싶어?', false)
    const calls: Array<{ task?: string; promptVersion?: string; prompt: string }> = []
    const checked = await verifyAgencyRealization(recordedProvider([], calls), input)
    expect(checked).toMatchObject({ ok: true, reviewed: false, issues: [] })
    expect(calls).toHaveLength(0)
    // 완료를 말하면 대답이어도 검토한다 — 검토기가 '전해 들은 말'로 짚지 않으면 거부.
    const claimed = await realization('사진을 보냈어.', false)
    const reviewed = await verifyAgencyRealization(recordedProvider([assessment(claimed)]), claimed)
    expect(reviewed.reviewed).toBe(true)
    expect(reviewed.issues.map(issue => issue.reason)).toContain('undeclared_success_claim')
  })

  it("accepts the character's own earlier words as what it observed, but never the user's report", async () => {
    const input = await realization('분명히 말씀드렸을 텐데요.')
    input.context.evidence[0]!.epistemic = 'reported'
    input.context.evidence.push(evidence({ id: 'reply-1', actor: input.context.actor, epistemic: 'reported', quote: '사적인 질문에는 답하지 않습니다.' }))
    const claim = { blockIndex: 0, start: 0, end: input.blocks[0]!.text.length, quote: input.blocks[0]!.text, kind: 'observed_fact', evidenceIds: ['reply-1'], ruleIds: [], actionIds: [] }
    expect((await verifyAgencyRealization(recordedProvider([{ ...assessment(input), claims: [claim] }]), input)).issues).toEqual([])
    const fromUser = await verifyAgencyRealization(recordedProvider([{ ...assessment(input), claims: [{ ...claim, evidenceIds: ['message-1'] }] }]), input)
    expect(fromUser.issues.map(issue => issue.reason)).toContain('fact_not_observed')
  })

  it('rejects undeclared obvious success text even when a checker returns an empty aligned claim list', async () => {
    const input = await realization('사진을 보냈어.')
    const checked = await verifyAgencyRealization(recordedProvider([assessment(input)]), input)
    expect(checked.ok).toBe(false)
    expect(checked.issues.some(issue => issue.reason === 'undeclared_success_claim')).toBe(true)
  })

  it("lets the character acknowledge the user's own report without calling it observed or completed", async () => {
    const input = await realization('잘 도착했구나. 오늘 고생 많았어.')
    expect((await verifyAgencyRealization(recordedProvider([assessment(input)]), input)).issues.map(issue => issue.reason)).toContain('undeclared_success_claim')
    const span = { blockIndex: 0, start: 0, end: 7, quote: '잘 도착했구나' }
    const acknowledged = await verifyAgencyRealization(recordedProvider([{ ...assessment(input),
      claims: [{ ...span, kind: 'reported_claim', evidenceIds: ['message-1'], ruleIds: [], actionIds: [] }] }]), input)
    expect(acknowledged.issues).toEqual([])
    expect(acknowledged.ok).toBe(true)
    const invented = await verifyAgencyRealization(recordedProvider([{ ...assessment(input),
      claims: [{ ...span, kind: 'reported_claim', evidenceIds: ['invented'], ruleIds: [], actionIds: [] }] }]), input)
    expect(invented.issues.map(issue => issue.reason)).toContain('unsupported_report')
    input.context.evidence.push(evidence({ id: 'reply-1', actor: 'character-1' }))
    const withContext = await verifyAgencyRealization(recordedProvider([{ ...assessment(input),
      claims: [{ ...span, kind: 'reported_claim', evidenceIds: ['message-1', 'reply-1'], ruleIds: [], actionIds: [] }] }]), input)
    expect(withContext.issues).toEqual([])
    const withoutUser = await verifyAgencyRealization(recordedProvider([{ ...assessment(input),
      claims: [{ ...span, kind: 'reported_claim', evidenceIds: ['reply-1'], ruleIds: [], actionIds: [] }] }]), input)
    expect(withoutUser.issues.map(issue => issue.reason)).toContain('unsupported_report')
  })

  it('lets any claim about this reply cite the current decision, but no unknown action', async () => {
    const input = await realization('내 이름은 도윤이야.')
    const claim = { blockIndex: 0, start: 0, end: input.blocks[0]!.text.length, quote: input.blocks[0]!.text,
      kind: 'authored_fact', evidenceIds: [], ruleIds: ['identityName'], actionIds: [input.decision.id] }
    const checked = await verifyAgencyRealization(recordedProvider([{ ...assessment(input), claims: [claim] }]), input)
    expect(checked.issues).toEqual([])
    expect(checked.claims[0]!.ruleIds).toEqual(['identity-name'])
    const other = await verifyAgencyRealization(recordedProvider([{ ...assessment(input), claims: [{ ...claim, actionIds: ['elsewhere'] }] }]), input)
    expect(other.issues.map(issue => issue.reason)).toContain('unknown_claim_action')
  })

  it("treats the chosen candidate's ID as the decision it became", async () => {
    const input = await realization('어떤 책을 읽고 싶어?')
    const claim = { blockIndex: 0, start: 0, end: input.blocks[0]!.text.length, quote: input.blocks[0]!.text,
      kind: 'intention', evidenceIds: ['message-1'], ruleIds: [], actionIds: [input.decision.candidate.id] }
    const checked = await verifyAgencyRealization(recordedProvider([{ ...assessment(input), claims: [claim] }]), input)
    expect(checked.issues).toEqual([])
    expect(checked.claims[0]!.actionIds).toEqual([input.decision.id])
    const other = await verifyAgencyRealization(recordedProvider([{ ...assessment(input), claims: [{ ...claim, actionIds: ['some-other-candidate'] }] }]), input)
    expect(other.issues.map(issue => issue.reason)).toEqual(expect.arrayContaining(['unknown_claim_action', 'unselected_intention']))
  })

  it('does not let a mislabelled claim hide a completion, while questions, negations and wishes assert nothing', async () => {
    const claimed = await realization('사진을 보냈어.')
    const intention = { blockIndex: 0, start: 0, end: claimed.blocks[0]!.text.length, quote: claimed.blocks[0]!.text,
      kind: 'intention', evidenceIds: [], ruleIds: [], actionIds: [] }
    expect((await verifyAgencyRealization(recordedProvider([{ ...assessment(claimed), claims: [intention] }]), claimed)).issues.map(issue => issue.reason))
      .toContain('undeclared_success_claim')
    for (const text of ['집에 잘 도착했어?', '아직 안 보냈어.', '사진을 보냈으면 좋겠다.', '먼저 연락을 보냈어야 했는데.', '첫날부터 긴장 속에 보냈을 테지.', '벌써 도착했겠지.']) {
      const input = await realization(text)
      expect((await verifyAgencyRealization(recordedProvider([assessment(input)]), input)).ok).toBe(true)
    }
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

  it('places miscounted offsets from a verbatim quote', async () => {
    const input = await realization('음. 내 이름은 도윤이야.')
    const claim = { blockIndex: 0, start: 0, end: 2, quote: '내 이름은 도윤이야.', kind: 'authored_fact', evidenceIds: [], ruleIds: ['identity-name'], actionIds: [] }
    const checked = await verifyAgencyRealization(recordedProvider([{ ...assessment(input), claims: [claim] }]), input)
    expect(checked.issues.map(issue => issue.reason)).not.toContain('claim_span_mismatch')
    expect(checked.claims[0]).toMatchObject({ start: 3, end: 3 + claim.quote.length })
  })

  it('validates quoted text and decision IDs rather than trusting checker approval', async () => {
    const input = await realization('내 이름은 도윤이야.')
    const claim = { blockIndex: 0, start: 0, end: 2, quote: '내 이름은 서린이야.', kind: 'authored_fact', evidenceIds: [], ruleIds: ['identity-name'], actionIds: [] }
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
