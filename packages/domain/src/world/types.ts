/**
 * World State — 턴마다 초기화되지 않는 지속 상태.
 * Chat / Photo / Call / Background / Reality 가 모두 이 하나의 상태를 참조한다.
 */
export type WorldState = {
  id: string
  sessionId: string
  /** optimistic lock. 동시 RP 요청이 이전 상태를 덮어쓰는 것을 막는다. */
  version: number

  currentLocation: string
  currentTime: string
  currentSceneId: string | null
  worldStatus: string | null
  activeEventIds: string[]
  activeNpcIds: string[]
  unresolvedWorldEvents: string[]
  updatedAt: Date
}

export type WorldSetting = {
  id: string
  era: string | null
  location: string | null
  genre: string | null
  worldSetting: string | null
}

export type WorldDelta = {
  currentLocation?: string
  currentTime?: string
  worldStatus?: string
  addActiveNpcIds?: string[]
  removeActiveNpcIds?: string[]
}
