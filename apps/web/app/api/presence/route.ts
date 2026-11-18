import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { currentUser } from '@/lib/auth'
import { track } from '@/lib/analytics/track'
import { deviceOf, leavePresence, livePresence, presenceOf, touchPresence } from '@/lib/presence'

const clean = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null
const USER_RECHECK_MS = 5 * 60_000

/**
 * 화면이 45초마다 보내는 '아직 보고 있어요' 신호(11/13). 익명 ID 쿠키(홈 방문 집계와 같은 것)로 사람을 구분한다.
 * 11/18: 주소가 바뀐 신호만 page_viewed 로 남긴다(같은 화면 새로고침·45초 신호는 안 남김), 탭을 닫으면 { leave: true }.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { path?: unknown; src?: unknown; ref?: unknown; leave?: unknown } | null
  const jar = await cookies()
  let id = jar.get('miro_anon')?.value
  if (body?.leave === true) { if (id) leavePresence(id); return new Response(null, { status: 204 }) }
  // 주소만 — 쿼리(쿠폰 코드 등)는 받지 않는다. 분석 이벤트 칸 상한(80자)에 맞춘다.
  const path = clean(body?.path, 80)?.split('?')[0]
  if (!path || !path.startsWith('/')) return new Response(null, { status: 204 })
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    id = randomUUID()
    jar.set('miro_anon', id, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 365 * 86400 })
  }
  const src = clean(body?.src, 20), ref = clean(body?.ref, 60)
  const device = deviceOf(req.headers.get('user-agent'))
  const cur = presenceOf(id)
  const moved = !cur || !!cur.leftAt || cur.path !== path
  // 누구인지는 화면을 옮길 때나 5분에 한 번만 확인한다 — 45초 신호마다 DB 를 읽지 않는다.
  if (moved || Date.now() - cur.checkedAt > USER_RECHECK_MS) {
    const user = await currentUser().catch(() => null)
    touchPresence(id, { path, src: src && /^[a-z0-9_-]+$/i.test(src) ? src.toLowerCase() : null, ref, userId: user?.id ?? null, device, checked: true })
  } else touchPresence(id, { path, device })
  if (moved) void track(presenceOf(id)?.userId ?? null, 'page_viewed', { anonId: id, path, device })
  return new Response(null, { status: 204 })
}

/** 운영자 현황 페이지가 읽는다 — CRON_SECRET 이 있어야 열린다(이 맥의 로컬 페이지가 서버에 직접 묻는다). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response(null, { status: 404 })
  return Response.json({ now: Date.now(), people: livePresence() }, { headers: { 'Cache-Control': 'no-store' } })
}
