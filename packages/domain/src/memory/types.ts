export type MemoryType =
  | 'user_fact' | 'promise' | 'shared_event'
  | 'relationship_change' | 'preference' | 'conflict' | 'short_term_summary' | 'world_fact'
  /** 지난 이야기(11/3): 새 요약이 나올 때 덮어쓰지 않고 남긴 예전 요약. 모델이 직접 만들지 않는다. */
  | 'chapter'

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
  /** Loaded from the owned source message, not the time a delayed extractor stored this memory. */
  sourceOccurredAt?: Date | null
  /** Retrieval-only owned visible user words; never a model-authored memory summary. */
  sourceText?: string | null
  /** Who said the source words. A character's own established telling of an authored shared past is kept, but never as the user's words. */
  sourceRole?: 'user' | 'character' | null
  /** 기억 그래프의 엣지. 태그를 공유하는 기억끼리 이어진다. */
  tags: string[]
  createdAt: Date
  /** 사용자가 고정한 기억(11/3) — 검색에서 늘 먼저 실리고 정리 때 버리지 않는다. */
  pinned?: boolean
  /** 사용자가 직접 적은 기억(11/3) — 원문 메시지가 없어도 확인된 기억으로 쓴다. */
  byUser?: boolean
}

export type MemoryCandidate = {
  /** Only accepted from scoped, explicit memory corrections. */
  replaces?: string
  /** Extraction-only provenance; persistence rechecks ownership, visibility and the verbatim quote. */
  sourceMessageId?: string
  sourceQuote?: string
  type: MemoryType
  content: string
  importance: number
  persistence: number
  confidence: number
  /** 그래프 엣지용 주제어. 비어 있으면 content 에서 뽑는다. */
  tags?: string[]
}
