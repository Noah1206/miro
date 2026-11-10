import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull, ne, or, like } from 'drizzle-orm'
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
  const host = new URL(endpoint).origin
  const device = `${host}|${platformOf(req.headers.get('user-agent') ?? '')}`
  await db.insert(pushSubscriptions)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, device })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, failedAt: null, device },
    })
  // 11/10 알림이 두 번 오던 문제 — 같은 기기(알림 서비스 + 기기 종류)의 다른 구독은 멈춘다(아이폰 Safari·홈 화면 앱처럼 한 기기에 둘).
  // 표시가 없는 예전 구독은 같은 알림 서비스면 멈춘다 — 다른 기기였다면 그 기기에서 앱을 열 때 다시 등록돼 살아난다.
  // ponytail: 같은 종류 기기 두 대(아이폰 두 대 등)는 마지막에 연 쪽만 받는다 — 필요하면 기기마다 고유 id 를 저장한다.
  await db.update(pushSubscriptions).set({ failedAt: new Date() }).where(and(
    eq(pushSubscriptions.userId, user.id), ne(pushSubscriptions.endpoint, endpoint), isNull(pushSubscriptions.failedAt),
    or(eq(pushSubscriptions.device, device), and(isNull(pushSubscriptions.device), like(pushSubscriptions.endpoint, `${host}/%`))),
  ))
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

/** 기기 종류 — 같은 기기의 여러 구독을 묶는 데만 쓴다. */
function platformOf(ua: string): string {
  return /iPhone|iPod/.test(ua) ? 'iphone' : /iPad/.test(ua) ? 'ipad' : /Android/.test(ua) ? 'android' : /Macintosh|Mac OS X/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'windows' : /Linux/.test(ua) ? 'linux' : 'other'
}

function validTimeZone(timeZone: string): boolean {
  try { Intl.DateTimeFormat(undefined, { timeZone }); return true } catch { return false }
}
