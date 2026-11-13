import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { currentUser } from '@/lib/auth'
import { livePresence, presenceOf, touchPresence } from '@/lib/presence'

const clean = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null
const USER_RECHECK_MS = 5 * 60_000

/** 화면이 45초마다 보내는 '아직 보고 있어요' 신호(11/13). 익명 ID 쿠키(홈 방문 집계와 같은 것)로 사람을 구분한다. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { path?: unknown; src?: unknown; ref?: unknown } | null
  const path = clean(body?.path, 200)
  if (!path || !path.startsWith('/')) return new Response(null, { status: 204 })
  const jar = await cookies()
  let id = jar.get('miro_anon')?.value
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    id = randomUUID()
    jar.set('miro_anon', id, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 365 * 86400 })
  }
  const src = clean(body?.src, 20), ref = clean(body?.ref, 60)
  // 누구인지는 5분에 한 번만 확인한다 — 신호마다 DB 를 읽지 않는다.
  const cur = presenceOf(id)
  if (!cur || Date.now() - cur.checkedAt > USER_RECHECK_MS) {
    const user = await currentUser().catch(() => null)
    touchPresence(id, { path, src: src && /^[a-z0-9_-]+$/i.test(src) ? src.toLowerCase() : null, ref, userId: user?.id ?? null, checked: true })
  } else touchPresence(id, { path })
  return new Response(null, { status: 204 })
}

/** 운영자 현황 페이지가 읽는다 — CRON_SECRET 이 있어야 열린다(이 맥의 로컬 페이지가 서버에 직접 묻는다). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response(null, { status: 404 })
  return Response.json({ now: Date.now(), people: livePresence() }, { headers: { 'Cache-Control': 'no-store' } })
}
