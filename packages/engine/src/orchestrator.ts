import type { LLMProvider } from '@miro/providers'
import { SimulationProposal } from './proposal.schema'
import { buildContext, type BuiltContext, type SimulationSnapshot } from './context'
import { validateProposal, type ValidatedTransition } from './validator'

export type TurnResult = {
  transition: ValidatedTransition
  context: BuiltContext
  providerMode: 'live' | 'mock'
}

/**
 * 한 턴의 RP 처리.
 *
 * Context 조립 → 1회 Structured Generation → 검증까지만 담당한다.
 * DB 커밋은 여기서 하지 않는다 — 영속화는 호출자(웹 앱)의 트랜잭션 안에서 이뤄진다.
 * 그래야 도메인/엔진이 DB 에 의존하지 않는다.
 */
export async function runTurn(opts: {
  llm: LLMProvider
  snapshot: SimulationSnapshot
  userInput: string
}): Promise<TurnResult> {
  const context = buildContext(opts.snapshot)

  const proposal = await opts.llm.generateStructured({
    schema: SimulationProposal,
    system: context.system,
    prompt: `${context.prompt}\n\n## 사용자 입력\n${opts.userInput}\n\n위 입력에 이어지는 응답을 JSON 으로 반환하세요.`,
  })

  return {
    transition: validateProposal(proposal, opts.snapshot),
    context,
    providerMode: opts.llm.info.mode,
  }
}

/** 검증된 블록을 화면/저장용 텍스트로 합친다. */
export function renderBlocks(blocks: ValidatedTransition['blocks']): string {
  return blocks
    .map((b) => (b.type === 'dialogue' || b.type === 'npc'
      ? `${b.speaker}: ${b.text}`
      : b.text))
    .join('\n')
}
