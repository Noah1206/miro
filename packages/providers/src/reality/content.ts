import { z } from 'zod'
import type { LLMProvider } from '../types'

/** 선연락 본문. 짧고, 캐릭터 목소리이며, 채널에 맞는다. */
export const RealityContent = z.object({
  text: z.string().min(1).max(400),
  tone: z.enum(['warm', 'neutral', 'terse', 'urgent']),
})
export type RealityContent = z.infer<typeof RealityContent>

export type RealityContentInput = {
  characterName: string
  personality: string
  speechStyle: string | null
  channelLabel: string
  reason: string
  worldLocation: string
  worldStatus: string | null
  /** 관계를 수치가 아니라 행동 지침으로 넘긴다. */
  relationshipHint: string
  activeEventSummary: string | null
}

const SYSTEM = `당신은 역할극 캐릭터입니다. 사용자가 앱을 닫은 뒤, 캐릭터가 먼저 보내는 짧은 연락을 씁니다.

규칙:
- 캐릭터의 말투와 성격을 유지합니다.
- 관계 상태를 반영합니다. 거리가 먼 관계에서 다정하게 굴지 않습니다. 싸운 뒤라면 그 여파가 남아 있어야 합니다.
- 관계 수치나 시스템 용어를 절대 언급하지 않습니다.
- 사용자를 대신해 말하거나 사용자의 행동을 정하지 않습니다.
- 현재 세계 상황(장소, 진행 중인 일)과 모순되지 않습니다.
- 채널 표현에 맞춥니다. '편지' 라면 편지처럼, '문자' 라면 문자처럼.
- 2~4문장. 반드시 JSON 만 반환합니다.`

export async function generateRealityContent(
  llm: LLMProvider,
  input: RealityContentInput,
): Promise<RealityContent> {
  const prompt = [
    `캐릭터: ${input.characterName}`,
    `성격: ${input.personality}`,
    input.speechStyle ? `말투: ${input.speechStyle}` : null,
    `채널: ${input.channelLabel}`,
    `연락하는 이유: ${input.reason}`,
    `현재 장소: ${input.worldLocation}`,
    input.worldStatus ? `현재 상황: ${input.worldStatus}` : null,
    input.activeEventSummary ? `진행 중인 일: ${input.activeEventSummary}` : null,
    `관계 지침: ${input.relationshipHint}`,
    '',
    '위 상황에서 캐릭터가 먼저 보낼 연락을 JSON 으로 작성하세요: { "text": string, "tone": "warm"|"neutral"|"terse"|"urgent" }',
  ].filter(Boolean).join('\n')

  return llm.generateStructured({ schema: RealityContent, system: SYSTEM, prompt })
}

/**
 * Mock 본문. 관계 지침에 따라 결정적으로 달라진다 —
 * 싸운 직후 친밀한 연락이 나가지 않는다는 것(T8)을 검증할 수 있게.
 */
export function buildMockRealityContent(prompt: string): RealityContent {
  const distant = /거리를 둡니다|풀리지 않은 일/.test(prompt)
  const urgent = /진행 중인 일:/.test(prompt)
  const name = prompt.match(/캐릭터: (.+)/)?.[1] ?? '그'

  if (urgent && distant) {
    return { text: '할 말이 있다. 시간 될 때 연락해.', tone: 'terse' }
  }
  if (urgent) {
    return { text: `일이 생겼어요. 확인하면 바로 답 주세요. — ${name}`, tone: 'urgent' }
  }
  if (distant) {
    return { text: '…별일 없나.', tone: 'terse' }
  }
  return { text: '문득 생각나서요. 오늘은 어땠어요?', tone: 'warm' }
}
