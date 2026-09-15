import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, pushSubscriptions } from '@miro/db'
import { currentUser } from '@/lib/auth'

const Subscription = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

/** 브라우저의 PushSubscription 을 저장한다. endpoint 기준 upsert. */
export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = Subscription.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid subscription' }, { status: 400 })

  const { endpoint, keys } = parsed.data
  await db.insert(pushSubscriptions)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, failedAt: null },
    })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string }
  if (endpoint) await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)))
  return NextResponse.json({ ok: true })
}
