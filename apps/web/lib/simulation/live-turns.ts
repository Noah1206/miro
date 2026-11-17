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

/**
 * 11/17 문자방 — 답장은 큐 작업이 쓰고, 초안 글은 그 작업을 맡은 요청에만 흘렀다. 새로고침한 화면도 보게 방마다 지금 초안을 둔다.
 */
type Draft = { userId: string; id: string; text: string; done: boolean; listeners: Set<() => void> }
const drafts = new Map<string, Draft>()

/** 초안을 쓰는 쪽 — 첫 글이 올 때 자리를 만들고, 끝나면 지운다. */
export function messengerDraftWriter(sessionId: string, userId: string) {
  let d: Draft | null = null
  const notify = () => d?.listeners.forEach(f => f())
  return {
    draft(id: string, text: string) {
      if (!d) { d = { userId, id, text, done: false, listeners: new Set() }; drafts.set(sessionId, d) }
      d.id = id; d.text = text; notify()
    },
    reset() { if (d) { d.text = ''; notify() } },
    end() { if (!d) return; d.done = true; notify(); if (drafts.get(sessionId) === d) drafts.delete(sessionId) },
  }
}

/** 다른 요청이 지금 쓰고 있는 이 회원·이 방의 초안. 없으면 null. */
export function messengerDraft(sessionId: string, userId: string): Draft | null {
  const d = drafts.get(sessionId)
  return d && d.userId === userId && !d.done ? d : null
}
