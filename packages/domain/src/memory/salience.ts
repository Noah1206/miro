import { POLICY } from '@miro/config'
import type { MemoryCandidate } from './types'

/** 중요도 미만 후보는 장기 기억으로 승격하지 않는다. Memory != Conversation Log. */
export function filterSalient(candidates: MemoryCandidate[]): MemoryCandidate[] {
  const ranked = candidates
    .filter((c) => c.importance >= POLICY.memory.minImportance)
    .sort((a, b) => b.importance * b.persistence - a.importance * a.persistence)
  // A scheduled rolling summary is a separate layer. Three newly extracted facts must
  // not crowd it out on every twelfth turn and leave the old summary stuck indefinitely.
  const summary = ranked.find(c => c.type === 'short_term_summary')
  return [...ranked.filter(c => c.type !== 'short_term_summary').slice(0, POLICY.memory.maxCandidatesPerTurn), ...(summary ? [summary] : [])]
}

/**
 * Context 에 투입할 기억 선별.
 * sessionId 불일치 기억은 절대 포함하지 않는다 (명세서 11.1 권한&접근).
 */
export function selectRelevantMemories<T extends { sessionId: string; importance: number; persistence: number }>(
  memories: T[],
  sessionId: string,
  limit: number,
): T[] {
  return memories
    .filter((m) => m.sessionId === sessionId)
    .sort((a, b) => b.importance * b.persistence - a.importance * a.persistence)
    .slice(0, limit)
}
