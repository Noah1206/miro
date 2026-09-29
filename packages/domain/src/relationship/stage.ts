import type { RelationshipStage, RelationshipState } from './types'
import type { SemanticEvent } from './semantic'
import { FORGIVENESS, OPENING, ROMANCE, feltEvents, type RelationshipProfile } from './profile'

/**
 * Scores describe readiness; they never establish dating or consent on their own.
 * 문턱은 캐릭터의 관계 성격표를 따른다 — 마음을 여는 속도, 연애로 가는 속도(가지 않음 포함), 친구가 되는 계기, 화해 문턱.
 */
export function nextRelationshipStage(previous: RelationshipStage, projected: RelationshipState,
  events: SemanticEvent[], turn: number, profile?: RelationshipProfile | null): RelationshipStage {
  const felt = feltEvents(events, profile)
  const has = (type: SemanticEvent['type']) => felt.some(e => e.type === type && e.confidence >= .7)
  // 사과와 '친구가 되는 계기' 는 일어났는지만 본다 — 캐릭터가 그 일을 반기지 않아도(개의치 않음·싫어함) 관계가 영영 멈추지 않게.
  // 얼마나 흔들리는지는 사건 반응이 정한다(싫어하는 사과는 오히려 신뢰를 조금 깎아 문턱이 멀어진다).
  const happened = (type: SemanticEvent['type'], min = .7) => events.some(e => e.type === type && e.confidence >= min)
  if (has('rejection')) return 'distrust'
  if (has('hostility') && projected.trust < 35) return 'conflict'
  if (['conflict', 'distrust'].includes(previous)) {
    return happened('apologized') && projected.trust >= FORGIVENESS[profile?.forgiveness?.value ?? 'normal'].exitTrust ? 'acquaintance' : previous
  }
  // Existing romantic/professional/rival relationships keep their authored meaning.
  if (['dating', 'lover', 'professional', 'rivalry'].includes(previous)) return previous
  const open = OPENING[profile?.opening?.value ?? 'normal']
  if (previous === 'stranger') return turn >= open.acquaintanceTurn && (projected.trust >= open.acquaintanceTrust
    || projected.trust >= open.acquaintanceTrust - 5 && projected.attachment >= 20) ? 'acquaintance' : previous
  if (previous === 'acquaintance') {
    // 계기는 이번 턴에 있어야 한다(확신 무관 — 규칙 분류기의 낮은 확신도 센다).
    const moment = profile?.turningPoint?.value
    return turn >= open.friendTurn && projected.trust >= open.friendTrust && projected.attachment >= open.friendAttachment
      && (!moment || happened(moment, 0)) ? 'friend' : previous
  }
  const pace = profile?.romance?.value ?? 'normal'
  if (pace === 'never') return previous
  const romance = ROMANCE[pace]
  if (previous === 'friend' && has('confession') && projected.attraction >= romance.ambiguousAttraction && projected.trust >= romance.ambiguousTrust) return 'ambiguous'
  if (previous === 'ambiguous' && has('confession') && projected.attraction >= romance.flirtingAttraction && projected.trust >= romance.flirtingTrust
    && turn >= romance.flirtingTurn) return 'flirting'
  return previous
}
