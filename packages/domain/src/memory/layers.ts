import type { Memory, MemoryType } from './types'

/**
 * Memory 계층.
 *   working      최근 메시지 (스냅샷의 recentMessages) — 여기서 다루지 않는다
 *   short-term   최근 사건 요약 (feature memorySummaries 가 켜지면 LLM 이 만든다)
 *   long-term    사용자 사실·취향·약속 — 캐릭터가 반드시 기억해야 하는 것
 *   relationship 두 사람 사이의 사건 — 갈등·화해·관계 변화
 *   world        세계 상태·사건·NPC (world_states/events/npcs 표가 곧 world memory)
 */
export type MemoryLayer = 'long_term' | 'relationship'

export function layerOf(type: MemoryType): MemoryLayer {
  return type === 'shared_event' || type === 'relationship_change' || type === 'conflict' ? 'relationship' : 'long_term'
}

/** 한국어·영어 낱말 조각. 2글자 이상만 — 조사·한 글자는 잡음이다. */
function terms(text: string): string[] {
  return text.toLowerCase().split(/[\s,.!?~·、。'"“”()\[\]]+/).map((t) => t.replace(/(은|는|이|가|을|를|에|의|도|로|와|과|랑|한테|에게)$/, '')).filter((t) => t.length >= 2)
}

/**
 * 검색 — 전체 대화가 아니라 지금 말과 관련 있는 기억만 고른다.
 * 점수 = 중요도×지속성 + 지금 말과 겹치는 낱말 수×0.35. 겹치는 게 없어도 중요도 높은 것은 남는다.
 */
export function retrieveMemories<T extends Pick<Memory, 'sessionId' | 'importance' | 'persistence' | 'content'>>(
  memories: T[], sessionId: string, limit: number, query = '',
): T[] {
  const q = terms(query)
  const score = (m: T) => {
    const base = m.importance * m.persistence
    if (q.length === 0) return base
    const hay = m.content.toLowerCase()
    const overlap = q.filter((t) => hay.includes(t)).length
    return base + overlap * 0.35
  }
  return memories.filter((m) => m.sessionId === sessionId).sort((a, b) => score(b) - score(a)).slice(0, limit)
}

/** 프롬프트에 계층별로 나눠 싣는다 — 어떤 기억이 어떤 종류인지 모델이 구분한다. */
export function groupByLayer<T extends Pick<Memory, 'type'>>(memories: T[]): Record<MemoryLayer, T[]> {
  const out: Record<MemoryLayer, T[]> = { long_term: [], relationship: [] }
  for (const m of memories) out[layerOf(m.type)].push(m)
  return out
}
