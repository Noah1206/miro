import type { SimulationProposal } from './proposal.schema'

/**
 * Provider 미구성 시 RP 파이프라인을 돌리기 위한 결정적 Mock.
 *
 * 실제 생성이 아니며, 상태에 따라 다른 반응을 내도록 만들어
 * State-driven 동작을 검증할 수 있게 한다.
 */
export function buildMockProposal(
  prompt: string,
  opts: { characterName: string },
): SimulationProposal {
  const distance = num(prompt, /정서적 거리 (\d+)/) ?? 50
  const trust = num(prompt, /신뢰 (\d+)/) ?? 30
  // 화자 이름은 반드시 실제 캐릭터명이어야 한다 — Validator 가 대조한다.
  const name = opts.characterName
  const hasActiveEvent = prompt.includes('## 진행 중인 사건')

  // 거리가 멀면 짧고 건조하게, 가까우면 조금 더 길게 — 상태가 출력을 바꾼다.
  const cold = distance > 60
  const line = cold
    ? '…그래서요?'
    : '조금 놀랐어요. 그런 말을 할 줄은 몰랐는데.'

  const blocks: SimulationProposal['rp']['blocks'] = [
    { type: 'action', speaker: null, text: cold ? '그는 시선을 돌렸다.' : '그가 잠깐 말을 멈췄다.' },
    { type: 'dialogue', speaker: name, text: line },
  ]

  return {
    rp: { blocks },
    worldDelta: null,
    // 신뢰가 낮을수록 변화 폭이 작다.
    relationshipDelta: { trust: trust < 40 ? 1 : 2, emotionalDistance: -1, reason: 'mock turn' },
    sceneDelta: null,
    memoryCandidates: [],
    // 이미 사건이 진행 중이면 새 사건을 제안하지 않는다.
    eventCandidates: hasActiveEvent ? [] : [],
    npcActions: [],
    realityIntent: null,
  }
}

function num(text: string, re: RegExp): number | null {
  const m = text.match(re)
  return m?.[1] ? Number(m[1]) : null
}
