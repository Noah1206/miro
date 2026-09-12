export type EventStatus =
  | 'created' | 'active' | 'escalated' | 'resolved' | 'expired' | 'cancelled'

export type EventType =
  | 'conflict' | 'jealousy' | 'business_trip' | 'crisis' | 'rival'
  | 'scandal' | 'injury' | 'npc_arrival' | 'location_change'
  | 'work' | 'promise' | 'misunderstanding' | 'reconciliation'

export type SimulationEvent = {
  id: string
  sessionId: string
  type: EventType
  status: EventStatus
  /** 사건이 발생한 맥락. 왜 이 사건이 지금 발생했는지의 근거. */
  context: Record<string, unknown>
  participantNpcIds: string[]
  /** 사건이 남긴 지속 상태. 다음 턴에 이유 없이 사라지지 않게 하는 근거. */
  continuationState: Record<string, unknown>
  consequences: string[]
  /** 이 턴 이전에는 동일 유형 사건이 재발생할 수 없다. */
  cooldownUntilTurn: number
  createdAtTurn: number
  resolvedAtTurn: number | null
}

/** AI 가 제안하는 사건 후보. 조건 충족 = 발생 가능일 뿐 발생 확정이 아니다. */
export type EventCandidate = {
  type: EventType
  context: Record<string, unknown>
  participantNpcIds: string[]
  /** 현재 서사 맥락에서의 적합도 0-1 */
  relevance: number
  /** 감정적 압력 0-1 */
  salience: number
}
