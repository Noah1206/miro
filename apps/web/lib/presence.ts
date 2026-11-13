/**
 * 11/13 지금 접속 중인 사람(운영자 현황 페이지용). 화면이 45초마다 신호를 보내고, 서버는 메모리에만 들고 있다 — DB 에 쓰지 않는다.
 * ponytail: 서버 프로세스 하나의 메모리(맥 운영은 프로세스 하나). 배포·재시작하면 비고 1분 안에 다시 찬다. 서버가 여러 대가 되면 Redis 나 표로 옮길 것.
 */
export type Presence = { id: string; userId: string | null; path: string; src: string | null; ref: string | null; firstSeen: number; lastSeen: number; checkedAt: number }

const ALIVE_MS = 100_000   // 신호 45초 간격 — 두 번 놓치면 나간 것으로 본다
const MAX = 5000           // 아무나 부를 수 있는 주소라 메모리 상한을 둔다
const g = globalThis as typeof globalThis & { __miroPresence?: Map<string, Presence> }
const store = (g.__miroPresence ??= new Map<string, Presence>())

function prune(now: number) { for (const [k, v] of store) if (now - v.lastSeen > ALIVE_MS) store.delete(k) }

export function presenceOf(id: string): Presence | undefined { return store.get(id) }

export function touchPresence(id: string, seen: { path: string; src?: string | null; ref?: string | null; userId?: string | null; checked?: boolean }, now = Date.now()): void {
  const cur = store.get(id)
  if (!cur) {
    if (store.size >= MAX) { prune(now); if (store.size >= MAX) return }
    store.set(id, { id, userId: seen.userId ?? null, path: seen.path, src: seen.src ?? null, ref: seen.ref ?? null, firstSeen: now, lastSeen: now, checkedAt: seen.checked ? now : 0 })
    return
  }
  cur.path = seen.path; cur.lastSeen = now
  cur.src ??= seen.src ?? null; cur.ref ??= seen.ref ?? null   // 유입 경로는 처음 들어온 값만
  if (seen.checked) { cur.userId = seen.userId ?? null; cur.checkedAt = now }
}

export function livePresence(now = Date.now()): Presence[] {
  prune(now)
  return [...store.values()].sort((a, b) => b.lastSeen - a.lastSeen)
}
