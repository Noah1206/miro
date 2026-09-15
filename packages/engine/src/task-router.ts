import { z } from 'zod'
import { feature } from '@miro/config'
import { SEMANTIC_EVENT_TYPES } from '@miro/domain'
import { prompts, interactionImportance, importanceScore, type LLMProvider, type AITask } from '@miro/providers'
import { MemoryCandidateProposal } from './proposal.schema'
import type { SimulationSnapshot } from './context'
export const SemanticResult = z.object({ events: z.array(z.object({ type: z.enum(SEMANTIC_EVENT_TYPES), confidence: z.number().min(0).max(1) })).max(5) })
export const MemoryResult = z.object({ memories: z.array(MemoryCandidateProposal).max(3) })
export function planTasks(input: string, turn: number): AITask[] {
  const tasks: AITask[] = []
  if (feature('llmSemanticAnalysis') && importanceScore(interactionImportance(input)) >= .35) tasks.push('semantic_event')
  if (feature('memoryExtraction') && /기억|약속|비밀|사실|좋아하/.test(input)) tasks.push('memory_extraction')
  if (feature('memorySummaries') && turn > 0 && turn % 12 === 0) tasks.push('memory_summary')
  return [...tasks, 'dialogue']
}
export async function analyzeSemantic(llm: LLMProvider, input: string, s: SimulationSnapshot) {
  const p = prompts.select('semantic-event', s.relationship.sessionId)
  return llm.generateStructured({ schema: SemanticResult, task: 'semantic_event', system: p.system,
    prompt: JSON.stringify({ recent: s.recentMessages.slice(-4), input, contract: { events: [{type: SEMANTIC_EVENT_TYPES.join('|'), confidence: '0..1'}] } }), promptVersion: `semantic-event:${p.version}`, maxTokens: 256 })
}
export async function analyzeMemory(llm: LLMProvider, task: 'memory_summary' | 'memory_extraction', input: string, s: SimulationSnapshot) {
  const p = prompts.select(task === 'memory_summary' ? 'summary' : 'memory', s.relationship.sessionId)
  return llm.generateStructured({ schema: MemoryResult, task, system: p.system,
    prompt: JSON.stringify({ recent: s.recentMessages.slice(-12), input, contract: { memories: [{type: task === 'memory_summary' ? 'short_term_summary' : 'user_fact|promise|relationship_change|world_fact',content:'confirmed fact only',importance:'0..1',persistence:'0..1',confidence:'0..1'}] } }), promptVersion: `${p.id}:${p.version}`, maxTokens: 512 })
}
