import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, users, conversationRequests, aiFeedback } from '@miro/db'
import { currentUser } from '@/lib/auth'
const Input = z.object({ requestId: z.string().uuid(), signal: z.enum(['like','dislike','regenerate','continued','deleted','abandoned','inconsistency_report']) })
export async function POST(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'origin' }, { status: 403 })
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = Input.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const status = await db.transaction(async tx => {
    const [consent] = await tx.select().from(users).where(eq(users.id, user.id)).for('update')
    if (!consent?.allowTraining || !consent.aiConsentVersion) return 403
    const [r] = await tx.select({ id: conversationRequests.id }).from(conversationRequests).where(and(eq(conversationRequests.id, parsed.data.requestId), eq(conversationRequests.userId, user.id), eq(conversationRequests.status, 'completed')))
    if (!r) return 404
    await tx.insert(aiFeedback).values({ userId: user.id, ...parsed.data, consentVersion: consent.aiConsentVersion })
    return 200
  })
  return NextResponse.json({ ok: status === 200 }, { status })
}
