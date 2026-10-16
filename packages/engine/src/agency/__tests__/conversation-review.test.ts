import { describe, expect, it } from 'vitest'
import { assessConversationReview, ConversationReviewSchema, type ConversationReviewAssessment } from '../conversation-review'
import { verifyCommunicationPreferences } from '../realization'
import type { LLMProvider } from '@miro/providers'
import type { UserGroundingEvidence } from '../../conversation-grounding'

const blocks = [{ text: '할머니가 주신 파란 책갈피를 계속 쓰고 있군요.' }, { text: '저는 종이를 반으로 접었어요. 같이 읽을까요?' }]
const source: UserGroundingEvidence = { id: 'old-user', kind: 'user_statement', text: '할머니가 주신 파란 책갈피를 계속 쓰고 있어.' }
const supported = (): ConversationReviewAssessment => ({ complete: true, blocks: [
  { blockIndex: 0, noUserClaims: false, boundaryViolation: false, claims: [{ draftQuote: '할머니가 주신 파란 책갈피를 계속 쓰고',
    kind: 'user_history', verdict: 'supported', supportSourceId: source.id, sourceQuote: source.text }] },
  { blockIndex: 1, noUserClaims: true, boundaryViolation: false, claims: [] },
] })

describe('server-checked conversation evidence ledger', () => {
  it('accepts exact original user support while allowing own actions and an invitation', () => {
    expect(assessConversationReview(supported(), blocks, [source])).toMatchObject({ acceptable: true, claimsChecked: 1, blocksChecked: 2 })
  })

  it.each([
    ['unfinished analysis', (a: ConversationReviewAssessment) => { a.complete = false }, 'incomplete_review'],
    ['missing block', (a: ConversationReviewAssessment) => { a.blocks.pop() }, 'block_coverage'],
    ['duplicate block', (a: ConversationReviewAssessment) => { a.blocks[1]!.blockIndex = 0 }, 'block_coverage'],
    ['contradictory no-claims label', (a: ConversationReviewAssessment) => { a.blocks[0]!.noUserClaims = true }, 'claim_coverage'],
    ['invented draft quote', (a: ConversationReviewAssessment) => { a.blocks[0]!.claims[0]!.draftQuote = '밤마다 책을 읽다 잠든다' }, 'draft_quote_mismatch'],
    ['unavailable source', (a: ConversationReviewAssessment) => { a.blocks[0]!.claims[0]!.supportSourceId = 'made-up' }, 'source_unavailable'],
    ['paraphrased source quote', (a: ConversationReviewAssessment) => { a.blocks[0]!.claims[0]!.sourceQuote = '할머니에게 책갈피를 받았다' }, 'source_quote_mismatch'],
    ['explicit unsupported claim', (a: ConversationReviewAssessment) => { a.blocks[0]!.claims[0]!.verdict = 'unsupported' }, 'unsupported_claim'],
  ] as const)('rejects %s without trusting a global model verdict', (_name, change, issue) => {
    const ledger = supported(); change(ledger)
    expect(assessConversationReview(ledger, blocks, [source])).toMatchObject({ acceptable: false, issue })
  })

  it.each(['character_words', 'persona_background'] as const)('does not turn %s into heard user history', kind => {
    expect(assessConversationReview(supported(), blocks, [{ ...source, kind }])).toMatchObject({ acceptable: false, issue: 'source_scope' })
  })

  it('permits an actually visible persona property while keeping private history separate', () => {
    const appearance: UserGroundingEvidence = { id: 'persona', kind: 'persona_background', text: '검은 안경을 쓰고 있다. 의대 출신이다.' }
    const ledger: ConversationReviewAssessment = { complete: true, blocks: [{ blockIndex: 0, noUserClaims: false, boundaryViolation: false,
      claims: [{ draftQuote: '검은 안경', kind: 'visible_property', verdict: 'supported', supportSourceId: appearance.id, sourceQuote: '검은 안경을 쓰고 있다.' }] }] }
    expect(assessConversationReview(ledger, [{ text: '검은 안경이 눈에 띄네요.' }], [appearance]).acceptable).toBe(true)
  })

  it('rejects an unsupported observation alongside a supported possession claim in the same block', () => {
    const draft = [{ text: '노란 손수건을 가지고 다니는구나. 깨끗하게 잘 썼네.' }]
    const actual = { id: 'current-user-input', kind: 'user_statement' as const, text: '노란 손수건을 늘 가지고 다녀.' }
    const ledger: ConversationReviewAssessment = { complete: true, blocks: [{ blockIndex: 0, noUserClaims: false, boundaryViolation: false, claims: [
      { draftQuote: '노란 손수건을 가지고 다니는구나', kind: 'user_history', verdict: 'supported', supportSourceId: actual.id, sourceQuote: actual.text },
      { draftQuote: '깨끗하게 잘 썼네', kind: 'visible_property', verdict: 'unsupported', supportSourceId: '', sourceQuote: '' },
    ] }] }
    expect(assessConversationReview(ledger, draft, [actual])).toMatchObject({ acceptable: false, reason: 'unseen_user_observation', claimsChecked: 2 })
  })

  it('accepts a previously unsupported history only when an actual user source provides that exact fact', () => {
    const actual = { id: 'disclosed', kind: 'user_statement' as const, text: '밤마다 책을 읽다 잠들 때 그 파란 책갈피를 꽂아 둬.' }
    const draft = [{ text: '밤마다 책을 읽다 잠들 때 꽂아두던 그 책갈피군요.' }]
    const ledger: ConversationReviewAssessment = { complete: true, blocks: [{ blockIndex: 0, noUserClaims: false, boundaryViolation: false, claims: [
      { draftQuote: '밤마다 책을 읽다 잠들 때 꽂아두던 그 책갈피', kind: 'user_history', verdict: 'supported', supportSourceId: actual.id, sourceQuote: actual.text },
    ] }] }
    expect(assessConversationReview(ledger, draft, [actual]).acceptable).toBe(true)
    expect(assessConversationReview(ledger, draft, [])).toMatchObject({ acceptable: false, issue: 'source_unavailable' })
  })

  it('never accepts the old boolean-only response schema', () => {
    expect(ConversationReviewSchema.safeParse({ acceptable: true, blockIndex: 0, reason: 'none' }).success).toBe(false)
  })

  it('cannot use a server-added excerpt marker as if it were original user words', () => {
    const ledger = supported()
    ledger.blocks[0]!.claims[0]!.sourceQuote = '[excerpt]'
    expect(assessConversationReview(ledger, blocks, [{ ...source, text: '[excerpt] ' + source.text }], [source]))
      .toMatchObject({ acceptable: false, issue: 'source_quote_mismatch' })
  })

  it('computes the common verifier result from supplied sources rather than the model claiming support', async () => {
    const llm: LLMProvider = { info: { mode: 'mock', name: 'proof-contract', notice: 'Synthetic contract only' }, async generateStructured(request) {
      expect(request.maxTokens).toBe(1536)
      expect(request.thinking).toBe('medium')
      expect(request.promptVersion).toBe('agency-communication-check:v6')
      return request.schema.parse(supported())
    } }
    const result = await verifyCommunicationPreferences(llm, { evidence: [], recentUserMessages: [], groundingEvidence: [],
      blocks: blocks.map(block => ({ ...block, speaker: '토마스', type: 'dialogue' })) })
    expect(result).toMatchObject({ acceptable: false, issue: 'source_unavailable' })
  })
})
