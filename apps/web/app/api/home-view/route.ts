import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { currentUser } from '@/lib/auth'
import { track } from '@/lib/analytics/track'

/** 홈 방문 퍼널(11/8) — 로그인 전에도 익명 ID 쿠키로 사람 수를 센다. 로그인했으면 같은 익명 ID 와 user_id 가 함께 남아 이어 붙일 수 있다. */
export async function POST() {
  const jar = await cookies()
  let anonId = jar.get('miro_anon')?.value
  if (!anonId || !/^[0-9a-f-]{36}$/.test(anonId)) {
    anonId = randomUUID()
    jar.set('miro_anon', anonId, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 365 * 86400 })
  }
  const user = await currentUser()
  await track(user?.id ?? null, 'home_viewed', { anonId })
  return new Response(null, { status: 204 })
}
