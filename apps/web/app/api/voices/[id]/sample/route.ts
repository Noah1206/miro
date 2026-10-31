import { feature } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { voiceSample } from '@/lib/voice'

export const runtime = 'nodejs'

/** 만들기 화면 미리 듣기 막대 — 고를 수 있는 목소리의 견본(id 'default' = 기본 목소리). 만드는 중이면 202, 화면이 1초마다 다시 묻는다. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!feature('characterVoice')) return new Response(null, { status: 404 })
  const user = await currentUser()
  if (!user) return new Response(null, { status: 401 })
  const { id } = await params
  const out = await voiceSample(user.id, id === 'default' ? '' : id).catch(() => null)
  if (out === 'pending') return new Response(null, { status: 202 })
  if (!out) return new Response(null, { status: 404 })
  return new Response(out, { headers: { 'content-type': 'audio/wav', 'cache-control': 'private, max-age=3600' } })
}
