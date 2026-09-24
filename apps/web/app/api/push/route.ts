import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, pushSubscriptions, userSettings } from '@miro/db'
import { currentUser } from '@/lib/auth'

const Subscription = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

/** 브라우저의 PushSubscription 을 저장한다. endpoint 기준 upsert. */
export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = Subscription.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid subscription' }, { status: 400 })

  const { endpoint, keys } = parsed.data
  await db.insert(pushSubscriptions)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, failedAt: null },
    })
  // 시간대를 고르는 설정은 없다 — 기기가 알려 준 시간대로 캐릭터의 활동 시간을 본다. 모르는 값은 버린다.
  const timeZone = typeof body?.timeZone === 'string' && body.timeZone.length <= 64 ? body.timeZone : null
  if (timeZone && validTimeZone(timeZone)) await db.insert(userSettings).values({ userId: user.id, timeZone })
    .onConflictDoUpdate({ target: userSettings.userId, set: { timeZone, updatedAt: new Date() } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string }
  if (endpoint) await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)))
  return NextResponse.json({ ok: true })
}

function validTimeZone(timeZone: string): boolean {
  try { Intl.DateTimeFormat(undefined, { timeZone }); return true } catch { return false }
}
