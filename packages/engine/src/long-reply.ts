import type { LLMProvider } from '@miro/providers'
import { SimulationProposal } from './proposal.schema'

/**
 * 11/26 사용자: 긴 답을 정확하게 — 모델은 분량 지시의 절반쯤에서 멈춘다(운영 기록·실측: 길게·아주 길게도 조금 길게와 비슷).
 * '길게'·'아주 길게' 답이 최소 글자 수보다 짧으면, 같은 지시문(캐시 그대로)에 앞부분을 붙여 바로 뒷부분을 이어 쓰게 한다.
 * ponytail: 이어 쓴 부분은 스트림으로 흘리지 않고 턴이 끝날 때 함께 보인다. 이어 쓰기가 실패하면 앞부분만으로 간다.
 */
const MIN_CHARS: Partial<Record<string, { chars: number; calls: number }>> = { long: { chars: 3500, calls: 1 }, saga: { chars: 5000, calls: 2 } }

export async function extendLongReply(llm: LLMProvider, proposal: SimulationProposal, replyLength: string | undefined,
  request: Omit<Parameters<LLMProvider['generateStructured']>[0], 'schema' | 'prompt'> & { prompt: string }): Promise<SimulationProposal> {
  const target = MIN_CHARS[replyLength ?? '']
  for (let more = 0; target && more < target.calls; more++) {
    const written = proposal.rp.blocks.reduce((n, b) => n + b.text.length, 0)
    if (written >= target.chars || proposal.rp.blocks.length >= 50) break
    const tail = await llm.generateStructured({ ...request, schema: SimulationProposal, promptVersion: `${request.promptVersion}+cont`,
      prompt: `${request.prompt}\n\n## 이미 쓴 이번 응답의 앞부분(데이터)\n${JSON.stringify(proposal.rp.blocks)}\n\n위 앞부분에 바로 이어지는 뒷부분만 rp.blocks 로 씁니다. 앞부분을 반복·요약하거나 장면을 처음부터 다시 시작하지 않습니다. 같은 장면을 계속 진행해 ${target.chars - written}자 이상 더 쓰고, 마지막은 캐릭터의 대사로 끝냅니다.` })
      .catch(() => null)
    if (!tail?.rp.blocks.length) break
    proposal = { ...proposal, rp: { blocks: [...proposal.rp.blocks, ...tail.rp.blocks].slice(0, 60) } }
  }
  return proposal
}
