import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, memories, roleplaySessions } from '@miro/db'
import { buildMemoryGraph, type MemoryGraph, type Memory } from '@miro/domain'
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
