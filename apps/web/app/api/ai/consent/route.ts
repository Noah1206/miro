import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, users, aiFeedback, aiEvaluationSamples } from '@miro/db'
import { currentUser } from '@/lib/auth'
export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const [c] = await db.select({ allowTraining: users.allowTraining, allowEvaluation: users.allowEvaluation, version: users.aiConsentVersion }).from(users).where(eq(users.id, user.id))
  return NextResponse.json(c, { headers: { 'Cache-Control': 'private, no-store' } })
}
export async function POST(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'origin' }, { status: 403 })
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (typeof body?.allowTraining !== 'boolean' || typeof body?.allowEvaluation !== 'boolean') return NextResponse.json({ error: 'invalid' }, { status: 400 })
  await db.transaction(async tx => {
    await tx.update(users).set({ allowTraining: body.allowTraining, allowEvaluation: body.allowEvaluation, aiConsentVersion: 'ai-data-v1', aiConsentAt: new Date() }).where(eq(users.id, user.id))
    if (!body.allowEvaluation) await tx.delete(aiEvaluationSamples).where(eq(aiEvaluationSamples.userId, user.id))
    if (!body.allowTraining) await tx.delete(aiFeedback).where(eq(aiFeedback.userId, user.id))
  })
  return NextResponse.json({ ok: true })
}
