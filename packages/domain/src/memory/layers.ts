import type { Memory, MemoryType } from './types'

/**
 * Memory 계층.
 *   working      최근 메시지 (스냅샷의 recentMessages) — 여기서 다루지 않는다
 *   short-term   최근 사건 요약 (feature memorySummaries 가 켜지면 LLM 이 만든다)
 *   long-term    사용자 사실·취향·약속 — 캐릭터가 반드시 기억해야 하는 것
 *   relationship 두 사람 사이의 사건 — 갈등·화해·관계 변화
 *   world        세계 상태·사건·NPC (world_states/events/npcs 표가 곧 world memory)
 */
export type MemoryLayer = 'long_term' | 'relationship' | 'short_term' | 'world'

export function layerOf(type: MemoryType): MemoryLayer {
  if (type === 'short_term_summary') return 'short_term'
  if (type === 'world_fact') return 'world'
  return type === 'shared_event' || type === 'relationship_change' || type === 'conflict' ? 'relationship' : 'long_term'
}

/** 한국어·영어 낱말 조각. 조사가 붙어 검색에서 탈락하지 않게 하되 원문 자체는 바꾸지 않는다. */
export function terms(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).flatMap(t => {
    const stem = t.replace(/(으로는|에서는|에게는|한테는|으로|에서|한테|에게|처럼|보다|까지|부터|하고|이랑|랑|은|는|이|가|을|를|에|의|도|로|와|과)$/, '')
    return [t, stem].filter(s => s.length >= 2)
  }))]
}

type SearchableMemory = Pick<Memory, 'sessionId' | 'importance' | 'persistence' | 'content'>
  & Partial<Pick<Memory, 'type' | 'tags' | 'createdAt' | 'sourceMessageId' | 'confidence'>>

const timeOf = (m: SearchableMemory) => m.createdAt?.getTime() ?? 0
const durable = (m: SearchableMemory) => m.persistence >= .6 && (m.confidence ?? 1) >= .6

/** Retrieval classification only. The source statement still determines what the user actually requested. */
export function isCommunicationPreference(m: Pick<Memory, 'type' | 'content'> & Partial<Pick<Memory, 'tags'>>): boolean {
  return m.type === 'preference' && /대화\s*선호|communication[_ ]preference|호칭|말투|칭찬|응원|위로|피드백|불러|부르|말하지|빈말|완벽|prais|reassur|nickname|feedback|call me/i.test(`${m.content} ${(m.tags ?? []).join(' ')}`)
}

/** Tags add the extractor's topic wording; character n-grams cover inflection, not semantic equivalence. */
function relevance(m: SearchableMemory, query: string[]): number {
  if (!query.length) return 0
  const hay = `${m.content} ${(m.tags ?? []).join(' ')}`.toLowerCase()
  const words = terms(hay)
  return Math.min(3, query.reduce((sum, q) => {
    if (hay.includes(q)) return sum + .35
    // A long inflected word can share a 3-character stem. Do not match arbitrary 2-character fragments.
    const grams = Array.from({ length: Math.min(24, Math.max(0, q.length - 2)) }, (_, i) => q.slice(i, i + 3))
    if (grams.length && words.some(w => w.length >= 3 && grams.some(part => w.includes(part)))) return sum + .12
    return sum
  }, 0))
}

/**
 * Query matches compete with enduring preferences and shared history, not just high-scoring facts.
 * Reserved slots keep old boundaries/promises available even when the current message uses different words.
 * This is bounded lexical/tag retrieval; it does not claim embedding-level semantic recall.
 */
export function retrieveMemories<T extends SearchableMemory>(
  memories: T[], sessionId: string, limit: number, query = '',
): T[] {
  if (limit <= 0) return []
  const q = terms(query).slice(0, 64)
  const scored = memories.filter(m => m.sessionId === sessionId).map(m => ({ m, score: m.importance * m.persistence + relevance(m, q) }))
    .sort((a, b) => b.score - a.score || timeOf(b.m) - timeOf(a.m))
  const selected = new Set<T>()
  const reserve = (type: MemoryType, count: number, latest = false) => {
    const candidates = scored.filter(({ m }) => m.type === type && durable(m))
    if (latest) candidates.sort((a, b) => timeOf(b.m) - timeOf(a.m) || b.score - a.score)
    for (const { m } of candidates.slice(0, count)) if (selected.size < limit) selected.add(m)
  }
  if (limit >= 4) {
    const preferenceQuota = Math.min(4, Math.max(1, Math.floor(limit / 3)))
    const communication = scored.filter(({ m }) => m.type && durable(m) && isCommunicationPreference({ ...m, type: m.type }))
      .sort((a, b) => timeOf(b.m) - timeOf(a.m) || b.score - a.score)
    for (const { m } of communication.slice(0, Math.min(2, preferenceQuota))) selected.add(m)
    const preferences = scored.filter(({ m }) => m.type === 'preference' && durable(m) && !selected.has(m))
      .sort((a, b) => timeOf(b.m) - timeOf(a.m) || b.score - a.score)
    for (const { m } of preferences.slice(0, preferenceQuota - selected.size)) selected.add(m)
    reserve('promise', limit >= 16 ? 2 : 1)
    reserve('conflict', 1)
    if (limit >= 7) reserve('shared_event', 1)
    if (limit >= 12) reserve('relationship_change', 1)
  }
  for (const { m } of scored) if (selected.size < limit) selected.add(m)
  // Preserve ranking for callers; slots decide membership, not the order of the prompt.
  return scored.filter(({ m }) => selected.has(m)).map(({ m }) => m)
}

/** 프롬프트에 계층별로 나눠 싣는다 — 어떤 기억이 어떤 종류인지 모델이 구분한다. */
export function groupByLayer<T extends Pick<Memory, 'type'>>(memories: T[]): Record<MemoryLayer, T[]> {
  const out: Record<MemoryLayer, T[]> = { long_term: [], relationship: [], short_term: [], world: [] }
  for (const m of memories) out[layerOf(m.type)].push(m)
  return out
}

export type MemoryQuery = { sessionId: string; userId: string; query: string; limit: number }
/** Application adapters may use lexical SQL today and scoped vector retrieval later. */
export interface MemoryRetriever { retrieve(query: MemoryQuery): Promise<Memory[]> }
