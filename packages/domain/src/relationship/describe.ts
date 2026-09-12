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

import type { RelationshipStage } from './types'

/** 사용자에게 보이는 관계 문장. 수치가 아니라 상태다. 후퇴·정체·모호함도 표현한다. */
export function stageLabel(stage: RelationshipStage, r?: Pick<RelationshipState, 'emotionalDistance' | 'unresolvedEventIds'>): string {
  if (r && r.unresolvedEventIds.length > 0) return '감정이 복잡함'
  switch (stage) {
    case 'stranger': return '낯선 사이'
    case 'acquaintance': return '조금 익숙해짐'
    case 'professional': return '일로 얽힌 사이'
    case 'friend': return r && r.emotionalDistance < 30 ? '가까워지는 중' : '편한 사이'
    case 'rivalry': return '서로를 재는 중'
    case 'distrust': return '멀어지는 중'
    case 'ambiguous': return '서로를 의식함'
    case 'conflict': return '아직 풀리지 않음'
    case 'flirting': return '서로를 의식함'
    case 'dating': return '특별한 사이'
    case 'lover': return '연인'
  }
}
