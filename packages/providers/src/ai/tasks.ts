import { z } from 'zod'

export const AI_TASKS = ['dialogue', 'semantic_event', 'relationship_analysis', 'memory_extraction', 'memory_summary', 'event_generation', 'world_update', 'image_prompt', 'moderation'] as const
export type AITask = typeof AI_TASKS[number]
export const ImportanceSchema = z.object({
  emotionalIntensity: z.number().min(0).max(1), relationshipImpact: z.number().min(0).max(1),
  memoryImportance: z.number().min(0).max(1), eventPotential: z.number().min(0).max(1), complexity: z.number().min(0).max(1),
})
export type InteractionImportance = z.infer<typeof ImportanceSchema>

/** No plan input: Free and Pro always receive the same routing policy. */
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
