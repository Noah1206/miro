import type { RelationshipState } from './types'

/** 수치를 노출하는 대신 행동 지침으로 번역한다. Chat 컨텍스트와 선연락 본문이 같은 함수를 쓴다. */
export function describeRelationship(r: RelationshipState): string {
  const hints: string[] = []
  if (r.emotionalDistance > 65) hints.push('아직 거리를 둡니다. 쉽게 마음을 열지 않습니다.')
  else if (r.emotionalDistance < 30) hints.push('편안하게 대합니다.')
  if (r.trust < 30) hints.push('상대의 말을 곧이곧대로 믿지 않습니다.')
  if (r.jealousy > 55) hints.push('다른 사람 이야기에 민감하게 반응합니다.')
  if (r.protectiveness > 60) hints.push('상대가 위험해 보이면 먼저 개입합니다.')
  if (r.unresolvedEventIds.length > 0) hints.push('아직 풀리지 않은 일이 남아 있습니다.')
  return hints.length > 0 ? `행동 지침: ${hints.join(' ')}` : '행동 지침: 상황에 맞게 자연스럽게.'
}
