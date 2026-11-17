/**
 * 11/17 진행 중인 턴 — 답이 나오는 동안 새로고침해도 이어서 보이게, 방마다 지금까지 온 블록을 서버 메모리에 둔다.
 * 턴은 연결이 끊겨도 서버에서 끝까지 가므로(api/turn), 새로 연 화면이 /api/turn/live 로 이 값을 받아 이어서 그린다.
 * ponytail: 서버 한 대(맥 운영) 기준 프로세스 메모리, 여러 대로 늘리면 Redis pub/sub 으로.
 */
type Blocks = Array<Record<string, unknown>>
type Live = { userId: string; mode: 'chat' | 'messenger'; input: string; blocks: Blocks; done: boolean; listeners: Set<() => void> }

const rooms = new Map<string, Live>()

export function beginLive(sessionId: string, userId: string, mode: Live['mode'], input: string) {
  const live: Live = { userId, mode, input, blocks: [], done: false, listeners: new Set() }
  rooms.set(sessionId, live)
  const notify = () => live.listeners.forEach(f => f())
  return {
    blocks(blocks: Blocks) { live.blocks = blocks; notify() },
    reset() { live.blocks = []; notify() },
    end() { live.done = true; notify(); if (rooms.get(sessionId) === live) rooms.delete(sessionId) },
  }
}

/** 이 회원의 이 방에서 진행 중인 턴. 없으면 null. */
export function liveTurn(sessionId: string, userId: string, mode: Live['mode']): Live | null {
  const live = rooms.get(sessionId)
  return live && live.userId === userId && live.mode === mode && !live.done ? live : null
}
