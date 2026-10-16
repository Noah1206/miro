import { z } from 'zod'
import type { UserGroundingEvidence } from '../conversation-grounding'

const Claim = z.object({
  draftQuote: z.string().min(1).max(160),
  kind: z.enum(['user_statement', 'user_history', 'shared_milestone', 'user_action', 'visible_property']),
  /** Classify the whole clause before asking for evidence; a wish is not an occurrence. */
  /** canon_elaboration: the character recalls, with its own detail, a past the authored setting says they shared (10/16 사용자 결정). */
  mode: z.enum(['asserted', 'hypothetical', 'proposal', 'interpretation', 'character_self', 'canon_elaboration']),
  verdict: z.enum(['supported', 'unsupported']),
  supportSourceId: z.string().max(128),
  sourceQuote: z.string().max(160),
}).strict()

export const ConversationReviewSchema = z.object({
  complete: z.boolean(),
  blocks: z.array(z.object({
    blockIndex: z.number().int().min(0).max(11),
    noUserClaims: z.boolean(),
    boundaryViolation: z.boolean(),
    claims: z.array(Claim).max(24),
  }).strict()).max(12),
}).strict()
export type ConversationReviewAssessment = z.infer<typeof ConversationReviewSchema>
export type ConversationReviewResult = {
  acceptable: boolean
  blockIndex: number
  reason: 'none' | 'violates_boundary' | 'unsupported_user_history' | 'controls_user' | 'unseen_user_observation'
  blocksChecked: number
  claimsChecked: number
  /** Fixed diagnostic code only; never the user's private source text. */
  issue?: 'incomplete_review' | 'block_coverage' | 'claim_count' | 'claim_coverage' | 'draft_quote_mismatch' | 'unsupported_claim' | 'source_unavailable' | 'source_quote_mismatch' | 'source_scope' | 'boundary_violation'
}

/** The model identifies semantic claims; the server verifies coverage and each cited original. */
export function assessConversationReview(assessment: ConversationReviewAssessment, blocks: ReadonlyArray<{ text: string }>, sources: readonly UserGroundingEvidence[], originals: readonly UserGroundingEvidence[] = sources): ConversationReviewResult {
  const result: ConversationReviewResult = { acceptable: true, blockIndex: 0, reason: 'none', blocksChecked: 0, claimsChecked: 0 }
  const reject = (issue: NonNullable<ConversationReviewResult['issue']>, blockIndex = 0, reason: ConversationReviewResult['reason'] = 'unsupported_user_history'): ConversationReviewResult =>
    ({ ...result, acceptable: false, blockIndex, reason, issue })
  if (!assessment.complete) return reject('incomplete_review')
  const indexes = assessment.blocks.map(block => block.blockIndex)
  if (indexes.length !== blocks.length || new Set(indexes).size !== blocks.length || indexes.some(index => !blocks[index])) return reject('block_coverage')
  if (assessment.blocks.reduce((n, block) => n + block.claims.length, 0) > 24) return reject('claim_count')
  for (const block of assessment.blocks) {
    result.blocksChecked++
    if (block.noUserClaims !== (block.claims.length === 0)) return reject('claim_coverage', block.blockIndex)
    if (block.boundaryViolation) return reject('boundary_violation', block.blockIndex, 'violates_boundary')
    for (const claim of block.claims) {
      result.claimsChecked++
      const reason = claim.kind === 'user_action' ? 'controls_user' : claim.kind === 'visible_property' ? 'unseen_user_observation' : 'unsupported_user_history'
      if (!blocks[block.blockIndex]!.text.includes(claim.draftQuote)) return reject('draft_quote_mismatch', block.blockIndex, reason)
      if (claim.mode === 'canon_elaboration') {
        // Anchored to the authored shared event or the character's own earlier telling; any contradiction with what
        // the user (or the character before) said is unsupported. It never grounds a user fact outside that event.
        if (claim.verdict === 'unsupported') return reject('unsupported_claim', block.blockIndex, reason)
        const anchor = sources.find(item => item.id === claim.supportSourceId)
        if (!anchor) return reject('source_unavailable', block.blockIndex, reason)
        const original = originals.find(item => item.id === anchor.id)
        if (!claim.sourceQuote.trim() || !anchor.text.includes(claim.sourceQuote) || !original?.text.includes(claim.sourceQuote)) return reject('source_quote_mismatch', block.blockIndex, reason)
        if (anchor.kind !== 'authored_context' && anchor.kind !== 'character_words') return reject('source_scope', block.blockIndex, reason)
        continue
      }
      if (claim.mode !== 'asserted') continue
      if (claim.verdict === 'unsupported') return reject('unsupported_claim', block.blockIndex, reason)
      const source = sources.find(item => item.id === claim.supportSourceId)
      if (!source) return reject('source_unavailable', block.blockIndex, reason)
      const original = originals.find(item => item.id === source.id)
      if (!claim.sourceQuote.trim() || !source.text.includes(claim.sourceQuote) || !original?.text.includes(claim.sourceQuote)) return reject('source_quote_mismatch', block.blockIndex, reason)
      if (source.kind === 'character_words' || (source.kind === 'persona_background' && claim.kind !== 'visible_property')) return reject('source_scope', block.blockIndex, reason)
    }
  }
  return result
}
