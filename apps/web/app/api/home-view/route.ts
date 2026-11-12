import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { currentUser } from '@/lib/auth'
import { track } from '@/lib/analytics/track'

/** 홈 방문 퍼널(11/8) — 로그인 전에도 익명 ID 쿠키로 사람 수를 센다. 로그인했으면 같은 익명 ID 와 user_id 가 함께 남아 이어 붙일 수 있다. */
export async function POST(req: Request) {
  // 유입 경로(utm_source) — 짧은 영문·숫자만 받는다(아무 글자나 표에 쌓이지 않게).
  const raw = new URL(req.url).searchParams.get('src')?.toLowerCase()
  const src = raw && /^[a-z0-9_-]{1,20}$/.test(raw) ? raw : undefined
  const jar = await cookies()
  let anonId = jar.get('miro_anon')?.value
  if (!anonId || !/^[0-9a-f-]{36}$/.test(anonId)) {
    anonId = randomUUID()
    jar.set('miro_anon', anonId, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 365 * 86400 })
  }
  const user = await currentUser()
  await track(user?.id ?? null, 'home_viewed', { anonId, ...(src && { src }) })
  return new Response(null, { status: 204 })
}
