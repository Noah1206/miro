import type { Memory, MemoryCandidate } from './types'

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
  const seen = existing.map((m) => normalize(m.content))
  const out: MemoryCandidate[] = []

  for (const c of candidates) {
    const key = normalize(c.content)
    if (seen.some((e) => isSame(e, key))) continue
    seen.push(key)
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
  return { keep: ranked.slice(0, limit), drop: ranked.slice(limit) }
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?…,]/g, '')
}

/** 완전 일치이거나 한쪽이 다른 쪽을 포함하면 같은 기억으로 본다. */
function isSame(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 6 && long.includes(short)
}
