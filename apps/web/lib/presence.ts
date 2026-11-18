/**
 * 11/13 지금 접속 중인 사람(운영자 현황 페이지용). 화면이 45초마다 신호를 보내고, 서버는 메모리에만 들고 있다 — DB 에 쓰지 않는다.
 * 11/18: 마지막 신호 뒤 30분까지 들고 있다 — 관리자 화면이 온라인(100초 안)·비활성(30분 안)·오프라인(탭을 닫음)을 가른다. 기기 종류도 함께.
 * ponytail: 서버 프로세스 하나의 메모리(맥 운영은 프로세스 하나). 배포·재시작하면 비고 1분 안에 다시 찬다. 서버가 여러 대가 되면 Redis 나 표로 옮길 것.
 */
export type Device = 'pc' | 'mobile' | 'tablet'
export type Presence = {
  id: string; userId: string | null; path: string; src: string | null; ref: string | null; device: Device | null
  firstSeen: number; lastSeen: number; checkedAt: number; leftAt: number | null
}

const KEEP_MS = 30 * 60_000   // 비활성으로 보여 줄 기간
const MAX = 5000              // 아무나 부를 수 있는 주소라 메모리 상한을 둔다
const g = globalThis as typeof globalThis & { __miroPresence?: Map<string, Presence> }
const store = (g.__miroPresence ??= new Map<string, Presence>())

function prune(now: number) { for (const [k, v] of store) if (now - v.lastSeen > KEEP_MS) store.delete(k) }

export function presenceOf(id: string): Presence | undefined { return store.get(id) }

/** User-Agent 에서 기기 종류만 — UA 문자열 자체는 남기지 않는다. */
export function deviceOf(ua: string | null): Device | null {
  if (!ua) return null
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet'
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'mobile'
  return 'pc'
}

export function touchPresence(id: string, seen: { path: string; src?: string | null; ref?: string | null; userId?: string | null; device?: Device | null; checked?: boolean }, now = Date.now()): void {
  const cur = store.get(id)
  // 탭을 닫았다가 30분 안에 다시 오면 새 접속으로 본다(접속 시간을 다시 잰다).
  if (!cur || cur.leftAt) {
    if (!cur && store.size >= MAX) { prune(now); if (store.size >= MAX) return }
    store.set(id, { id, userId: seen.userId ?? cur?.userId ?? null, path: seen.path, src: seen.src ?? cur?.src ?? null, ref: seen.ref ?? cur?.ref ?? null,
      device: seen.device ?? cur?.device ?? null, firstSeen: now, lastSeen: now, checkedAt: seen.checked ? now : 0, leftAt: null })
    return
  }
  cur.path = seen.path; cur.lastSeen = now
  cur.src ??= seen.src ?? null; cur.ref ??= seen.ref ?? null   // 유입 경로는 처음 들어온 값만
  if (seen.device) cur.device = seen.device
  if (seen.checked) { cur.userId = seen.userId ?? null; cur.checkedAt = now }
}

/** 탭을 닫거나 다른 사이트로 나감(pagehide). ponytail: 같은 사람이 탭 두 개를 열어 두고 하나만 닫아도 오프라인이 되지만, 남은 탭의 다음 신호(45초 안)가 되살린다. */
export function leavePresence(id: string, now = Date.now()): void {
  const cur = store.get(id)
  if (cur) cur.leftAt = now
}

export function livePresence(now = Date.now()): Presence[] {
  prune(now)
  return [...store.values()].sort((a, b) => b.lastSeen - a.lastSeen)
}
