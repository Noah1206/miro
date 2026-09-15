import type { RelationshipStage, RelationshipState } from './types'
import type { SemanticEvent } from './semantic'

/** Scores describe readiness; they never establish dating or consent on their own. */
export function nextRelationshipStage(previous: RelationshipStage, projected: RelationshipState,
  events: SemanticEvent[], turn: number): RelationshipStage {
  const has = (type: SemanticEvent['type']) => events.some(e => e.type === type && e.confidence >= .7)
  if (has('rejection')) return 'distrust'
  if (has('hostility') && projected.trust < 35) return 'conflict'
  if (['conflict', 'distrust'].includes(previous)) {
    return has('apologized') && projected.trust >= 40 ? 'acquaintance' : previous
  }
  // Existing romantic/professional/rival relationships keep their authored meaning.
  if (['dating', 'lover', 'professional', 'rivalry'].includes(previous)) return previous
  if (previous === 'stranger') return turn >= 3 && (projected.trust >= 35 || projected.trust >= 30 && projected.attachment >= 20) ? 'acquaintance' : previous
  if (previous === 'acquaintance') return turn >= 8 && projected.trust >= 50 && projected.attachment >= 25 ? 'friend' : previous
  if (previous === 'friend' && has('confession') && projected.attraction >= 40 && projected.trust >= 50) return 'ambiguous'
  if (previous === 'ambiguous' && has('confession') && projected.attraction >= 60 && projected.trust >= 60 && turn >= 16) return 'flirting'
  return previous
}
