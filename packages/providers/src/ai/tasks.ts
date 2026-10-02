import { z } from 'zod'

/**
 * 모델을 부르는 일의 이름 — 사용량 기록의 축이자 모델 배치의 단위다.
 * 자율성의 계획·검사·컴파일은 이름이 따로다. 셋이 world_update 하나를 같이 쓰던 때는 역할마다 다른 모델을 줄 수 없었다(10/2).
 */
export const AI_TASKS = ['dialogue', 'semantic_event', 'relationship_analysis', 'memory_extraction', 'memory_summary', 'event_generation', 'world_update', 'image_prompt',
  'agency_plan', 'agency_verify', 'agency_compile', 'agency_life'] as const
export type AITask = typeof AI_TASKS[number]
/**
 * 강한 모델이 맡는 일 — 대사·계획·검사·컴파일·자기 삶·캐릭터 초안(10/2 결정). 나머지(분류·기억)는 싼 모델이 맡는다.
 * 대사를 맡은 모델은 레지스트리에 따로 적지 않아도 이 일들을 맡는다 — 운영 레지스트리에 world_update 가 빠져 그 일이 통째로 실패하던 것(9/26)을 막는다.
 */
export const STRONG_TASKS: readonly AITask[] = ['dialogue', 'agency_plan', 'agency_verify', 'agency_compile', 'agency_life', 'world_update']
export const ImportanceSchema = z.object({
  emotionalIntensity: z.number().min(0).max(1), relationshipImpact: z.number().min(0).max(1),
  memoryImportance: z.number().min(0).max(1), eventPotential: z.number().min(0).max(1), complexity: z.number().min(0).max(1),
})
export type InteractionImportance = z.infer<typeof ImportanceSchema>

/** 사용자 입력 한 줄의 무게 — 이번 턴의 차감 종류와 기억 추출 여부를 고른다. 모델 선택에는 쓰지 않는다(작업이 등급을 정한다). */
export function interactionImportance(message: string): InteractionImportance {
  const strong = /헤어지|그만 만나|끝내자|사랑해|사귀자|죽|배신|비밀|소개팅|다른 사람|거짓말/.test(message)
  const emotion = /미안|보고 싶|보고싶|싫어|질투|화났|울|고마워/.test(message)
  const memory = /기억|지난|예전|약속|비밀|사실|처음|그때/.test(message)
  const complexity = Math.min(1, message.length / 300 + (memory && strong ? .35 : 0))
  return { emotionalIntensity: strong ? .97 : emotion ? .6 : .08,
    relationshipImpact: strong ? .95 : emotion ? .5 : .08,
    memoryImportance: memory ? .85 : strong ? .6 : .08,
    eventPotential: strong ? .9 : emotion ? .4 : .05, complexity }
}
export function importanceScore(i: InteractionImportance): number {
  return Math.max(i.emotionalIntensity, i.relationshipImpact, i.memoryImportance, i.eventPotential, i.complexity)
}
export function taskOf(task?: string): AITask {
  if (AI_TASKS.includes(task as AITask)) return task as AITask
  const aliases: Record<string, AITask> = { character_response: 'dialogue', reality_content: 'dialogue', semantic_analysis: 'semantic_event', character_draft: 'world_update' }
  return aliases[task ?? ''] ?? 'dialogue'
}
