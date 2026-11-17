import { NextResponse } from 'next/server'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db, memories, roleplaySessions } from '@miro/db'
import { buildMemoryGraph, layerOf, type MemoryGraph, type MemoryLayer, type MemoryType, type Memory } from '@miro/domain'
import { currentUser } from '@/lib/auth'

export const runtime = 'nodejs'

/** 기억 노트 목록의 한 줄 — 그래프에 안 그리는 요약·지난 이야기도 여기엔 있다. */
export type MemoryNoteItem = { id: string; type: MemoryType; layer: MemoryLayer; content: string; pinned: boolean; byUser: boolean }
export type MemoryNotes = MemoryGraph & { items: MemoryNoteItem[]; note: string }
/** 11/10 유저노트 최대 글자 수 — 매 턴 프롬프트에 실린다. */
const USER_NOTE_MAX = 2000

const scope = (sessionId: string, userId: string) => and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId),
  isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt))

/**
 * 기억 그래프 + 노트 목록 — 유저가 캐릭터와 쌓은 관계를 노드와 선으로, 그리고 글로 본다.
 * 소유권은 세션 조인으로 강제한다. sessionId 만으로는 남의 기억을 읽을 수 없다.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { sessionId } = await params

  const [rows, [room]] = await Promise.all([db.select({ m: memories }).from(memories)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, memories.sessionId))
    .where(and(eq(memories.sessionId, sessionId), scope(sessionId, user.id))).orderBy(asc(memories.createdAt)),
    db.select({ note: roleplaySessions.userNote }).from(roleplaySessions).where(scope(sessionId, user.id)).limit(1)])
  const note = room?.note ?? ''
  // 세션이 없는 것과 기억이 아직 없는 것을 구분하지 않는다 — 존재 여부를 흘리지 않는다.
  if (rows.length === 0) return NextResponse.json({ nodes: [], edges: [], tags: [], items: [], note } satisfies MemoryNotes)

  const scoped = rows.map(({ m }) => ({
    ...m, importance: m.importance / 100, persistence: m.persistence / 100, confidence: m.confidence / 100,
  })) as Memory[]
  const items = scoped.map(m => ({ id: m.id, type: m.type, layer: layerOf(m.type), content: m.content, pinned: !!m.pinned, byUser: !!m.byUser }))
  return NextResponse.json({ ...buildMemoryGraph(scoped, sessionId), items, note } satisfies MemoryNotes)
}

/** 유저노트 저장. 11/17 기억 노트는 캐릭터의 기억이라 보기만 — 고치기·고정·지우기·직접 넣기('이 장면 기억하기' 포함)·정리하기는 사용자에게 열지 않는다. */
export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { sessionId } = await params
  const [room] = await db.select({ characterId: roleplaySessions.characterId }).from(roleplaySessions).where(scope(sessionId, user.id)).limit(1)
  if (!room) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const body = await req.json().catch(() => null) as { action?: unknown; content?: unknown } | null

  // 11/10 유저노트 저장 — 빈 글이면 지운다.
  if (body?.action === 'note') {
    const note = typeof body.content === 'string' ? body.content.trim() : null
    if (note === null || note.length > USER_NOTE_MAX) return NextResponse.json({ error: 'invalid_content' }, { status: 400 })
    await db.update(roleplaySessions).set({ userNote: note }).where(scope(sessionId, user.id))
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
}
