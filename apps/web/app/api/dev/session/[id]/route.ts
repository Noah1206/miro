import { devApiAllowed } from '@miro/config'
import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, roleplaySessions } from '@miro/db'
import { currentUser } from '@/lib/auth'

/** 개발/E2E 보조 라우트. 본인 세션의 characterId 만 반환한다. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!devApiAllowed()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const rows = await db.select({ characterId: roleplaySessions.characterId })
    .from(roleplaySessions)
    .where(and(eq(roleplaySessions.id, id), eq(roleplaySessions.userId, user.id)))
    .limit(1)

  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(rows[0])
}
