export type MemoryType =
  | 'user_fact' | 'promise' | 'shared_event'
  | 'relationship_change' | 'preference' | 'conflict' | 'short_term_summary' | 'world_fact'

export type Memory = {
  id: string
  /** Memory Isolation 의 핵심. 조회 시 반드시 session scope 를 강제한다. */
  sessionId: string
  characterId: string
  type: MemoryType
  content: string
  /** 0-1. 모든 발화를 동일 중요도로 저장하지 않는다. */
  importance: number
  /** 0-1. 시간이 지나도 유지되어야 하는 정도. */
  persistence: number
  confidence: number
  sourceMessageId: string | null
  createdAt: Date
}

export type MemoryCandidate = {
  type: MemoryType
  content: string
  importance: number
  persistence: number
  confidence: number
}
