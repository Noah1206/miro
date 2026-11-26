import { cookies } from 'next/headers'
import { currentUser } from '@/lib/auth'
import { track } from '@/lib/analytics/track'

const EVENTS = ['login_sheet_opened', 'login_provider_tapped'] as const
const path = (v: string | null) => v && v.startsWith('/') ? v.split('?')[0]!.slice(0, 80) : null

/** 가입 퍼널(11/27) — 대화 시작을 눌러 로그인 시트가 열린 순간과 소셜 버튼을 누른 순간. 익명 ID 는 접속 신호(/api/presence)가 심은 쿠키를 읽기만 한다. */
export async function POST(req: Request) {
  const q = new URL(req.url).searchParams
  const e = EVENTS.find(x => x === q.get('e'))
  if (!e) return new Response(null, { status: 204 })
  const anon = (await cookies()).get('miro_anon')?.value
  const provider = q.get('p')
  const user = await currentUser().catch(() => null)
  await track(user?.id ?? null, e, {
    anonId: anon && /^[0-9a-f-]{36}$/.test(anon) ? anon : null,
    path: path(q.get('path')), next: path(q.get('next')),
    ...(provider && /^[a-z]{1,12}$/.test(provider) && { provider }),
  })
  return new Response(null, { status: 204 })
}
