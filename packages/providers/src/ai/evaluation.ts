import { z } from 'zod'
export const GoldenCaseSchema = z.object({
  id: z.string(), context: z.string(), userInput: z.string(), requiredFacts: z.array(z.string()),
  forbiddenBehavior: z.array(z.string()), expectedStyle: z.enum(['messenger','balanced','narrative']),
  maxLength: z.number().int().positive(), referenceResponse: z.string(),
})
export type GoldenCase = z.infer<typeof GoldenCaseSchema>
export const QUALITY_DIMENSIONS = ['characterConsistency','relationshipConsistency','memoryAccuracy','koreanNaturalness','emotionalRealism','repetition','hallucination','responseLength','latency','cost'] as const
export function evaluateResponse(c: GoldenCase, response: string, latencyMs: number, estimatedCost: number | null) {
  const missingFacts = c.requiredFacts.filter(f => !response.includes(f))
  const forbidden = c.forbiddenBehavior.filter(f => response.includes(f))
  const internalLeak = /(?:질투|신뢰|호감도|애착)\s*(?:수치|점수)?\s*(?:가|는|:)?\s*\d{1,3}|토큰\s*\d|provider\s*[:=]/i.test(response)
  const sentences = response.split(/[.!?\n]+/).map(s => s.trim()).filter(Boolean)
  const repetition = sentences.length > 1 && new Set(sentences).size < sentences.length
  return { caseId: c.id, pass: !missingFacts.length && !forbidden.length && !internalLeak && !!response.trim() && response.length <= c.maxLength && !repetition,
    missingFacts, forbidden, internalLeak, repetition, responseLength: response.length, latencyMs, estimatedCost,
    // Semantic quality is not fabricated from keyword checks. A human/approved judge fills these 0..5.
    humanReview: { characterConsistency:null,relationshipConsistency:null,memoryAccuracy:null,koreanNaturalness:null,emotionalRealism:null,hallucination:null },
  }
}
