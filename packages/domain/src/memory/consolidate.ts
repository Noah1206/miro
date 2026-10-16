import type { Memory, MemoryCandidate } from './types'
import { isCommunicationPreference } from './layers'

/**
 * 중복·상충 기억 정리.
 *
 * 명세서 11.1 예외: "동일하거나 상충하는 기억이 반복 수집되면 최신 대화 맥락과
 * 저장된 관계 상태를 함께 고려해 응답 일관성을 유지한다."
 *
 * 같은 내용이 반복 저장되면 컨텍스트를 낭비하고 캐릭터가 같은 말을 되풀이하게 된다.
 */
export function dedupeCandidates(
  candidates: MemoryCandidate[],
  existing: Memory[],
): MemoryCandidate[] {
  const seen = new Set(existing.map((m) => `${m.type}:${normalize(m.content)}`))
  const out: MemoryCandidate[] = []

  for (const c of candidates) {
    const key = `${c.type}:${normalize(c.content)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

/**
 * 보존 한도를 넘으면 중요도가 낮은 것부터 버린다.
 * 오래되었다는 이유만으로 버리지 않는다 — 약속처럼 오래돼도 중요한 기억이 있다.
 */
export function pruneMemories(memories: Memory[], limit: number): {
  keep: Memory[]
  drop: Memory[]
} {
  if (memories.length <= limit) return { keep: memories, drop: [] }

  const ranked = [...memories].sort(
    (a, b) => b.importance * b.persistence - a.importance * a.persistence,
  )
  // Retention also needs diversity: a hundred strong factual memories must not erase the
  // reason for a disagreement or every explicit preference. Small caps keep old behavior.
  const protectedIds = new Set<string>()
  if (limit >= 12) {
    for (const type of ['short_term_summary', 'preference', 'promise', 'conflict', 'shared_event', 'relationship_change'] as const) {
      const quota = type === 'short_term_summary' ? 1 : Math.min(type === 'preference' ? 8 : 4, Math.floor(limit / 12))
      const candidates = ranked.filter(m => m.type === type)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      const communication = type === 'preference' ? candidates.filter(isCommunicationPreference).slice(0, Math.min(4, quota)) : []
      for (const m of communication) protectedIds.add(m.id)
      for (const m of candidates.filter(m => !protectedIds.has(m.id)).slice(0, quota - communication.length)) protectedIds.add(m.id)
    }
  }
  const keep = ranked.filter(m => protectedIds.has(m.id))
  for (const m of ranked) if (keep.length < limit && !protectedIds.has(m.id)) keep.push(m)
  const keptIds = new Set(keep.map(m => m.id))
  return { keep, drop: ranked.filter(m => !keptIds.has(m.id)) }
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?…,]/g, '')
}

// A longer sentence can add the cause, a correction or the resolution of an event.
// Substring containment is therefore not evidence that it is the same memory.
