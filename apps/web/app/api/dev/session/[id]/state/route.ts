import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, events, relationships, roleplaySessions } from '@miro/db'
import { currentUser } from '@/lib/auth'

const Body = z.object({
  idleMinutes: z.number().int().min(0).optional(),
  relationship: z.object({
    trust: z.number().int().min(0).max(100).optional(),
    attachment: z.number().int().min(0).max(100).optional(),
    emotionalDistance: z.number().int().min(0).max(100).optional(),
  }).optional(),
  activeEvent: z.object({ type: z.string().max(40), summary: z.string().max(200) }).optional(),
  pendingIntent: z.object({ channel: z.string(), reason: z.string(), urgency: z.number().min(0).max(1) }).optional(),
})

/** 개발/E2E 보조. 본인 세션의 시각과 관계 상태를 직접 조정한다. 운영에서는 닫혀 있다. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === 'production' && process.env.MIRO_ENABLE_DEV_API !== '1') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad body' }, { status: 400 })

  const owned = await db.select({ id: roleplaySessions.id }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.id, id), eq(roleplaySessions.userId, user.id))).limit(1)
  if (!owned[0]) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (parsed.data.idleMinutes !== undefined) {
    await db.update(roleplaySessions)
      .set({ lastInteractionAt: new Date(Date.now() - parsed.data.idleMinutes * 60_000), realityCheckedAt: null })
      .where(eq(roleplaySessions.id, id))
  }
  if (parsed.data.relationship) {
    await db.update(relationships).set(parsed.data.relationship)
      .where(eq(relationships.sessionId, id))
  }
  if (parsed.data.pendingIntent) {
    await db.update(roleplaySessions).set({ pendingRealityIntent: parsed.data.pendingIntent })
      .where(eq(roleplaySessions.id, id))
  }
  if (parsed.data.activeEvent) {
    await db.insert(events).values({
      sessionId: id, type: parsed.data.activeEvent.type, status: 'active', createdAtTurn: 1,
      continuationState: { summary: parsed.data.activeEvent.summary },
    })
  }
  return NextResponse.json({ ok: true })
}
