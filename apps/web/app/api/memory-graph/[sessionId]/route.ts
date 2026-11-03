import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, memories, roleplaySessions } from '@miro/db'
import { buildMemoryGraph, tagsOf, type MemoryGraph, type Memory } from '@miro/domain'
import { currentUser } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * 기억 그래프 — 유저가 캐릭터와 쌓은 관계를 노드와 선으로 본다.
 * 소유권은 세션 조인으로 강제한다. sessionId 만으로는 남의 기억을 읽을 수 없다.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { sessionId } = await params

  const rows = await db.select({ m: memories }).from(memories)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, memories.sessionId))
    .where(and(
      eq(memories.sessionId, sessionId), eq(roleplaySessions.userId, user.id),
      isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt),
    ))
  if (rows.length === 0) {
    // 세션이 없는 것과 기억이 아직 없는 것을 구분하지 않는다 — 존재 여부를 흘리지 않는다.
    return NextResponse.json({ nodes: [], edges: [], tags: [] } satisfies MemoryGraph)
  }

  const scoped = rows.map(({ m }) => ({
    ...m, importance: m.importance / 100, persistence: m.persistence / 100, confidence: m.confidence / 100,
  })) as Memory[]
  return NextResponse.json(buildMemoryGraph(scoped, sessionId))
}

/** 이 사용자의 살아 있는 방에 속한 기억인지 — 아니면 null. */
async function ownedMemory(sessionId: string, id: unknown) {
  const user = await currentUser()
  if (!user || typeof id !== 'string') return null
  const [row] = await db.select({ id: memories.id }).from(memories)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, memories.sessionId))
    .where(and(
      eq(memories.id, id), eq(memories.sessionId, sessionId), eq(roleplaySessions.userId, user.id),
      isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt),
    ))
  return row ?? null
}

/**
 * 기억 고치기(11/3) — 사용자가 바로잡은 기억은 확신 100, 태그는 새 내용에서 다시 뽑는다(검색·그래프가 옛 낱말을 따라가지 않게).
 * 다음 턴부터 프롬프트에 고친 내용이 실린다.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  const { sessionId } = await params
  const body = await req.json().catch(() => null) as { id?: unknown; content?: unknown } | null
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content || content.length > 300) return NextResponse.json({ error: 'invalid_content' }, { status: 400 })
  const row = await ownedMemory(sessionId, body?.id)
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  await db.update(memories).set({ content, confidence: 100, tags: tagsOf({ content, tags: [] }) }).where(eq(memories.id, row.id))
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  const { sessionId } = await params
  const body = await req.json().catch(() => null) as { id?: unknown } | null
  const row = await ownedMemory(sessionId, body?.id)
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  await db.delete(memories).where(eq(memories.id, row.id))
  return NextResponse.json({ ok: true })
}
