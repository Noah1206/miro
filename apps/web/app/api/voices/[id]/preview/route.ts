import { feature } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { voicePreview } from '@/lib/voice'

export const runtime = 'nodejs'

/**
 * 내 목소리 미리 듣기 — 만든 사람만. 올릴 때 GPU 가 한 번 만들어 둔 파일을 돌려준다(다시 들어도 GPU 를 쓰지 않는다).
 * 아직 만드는 중이면 202 — 화면이 2초마다 다시 묻는다.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!feature('characterVoice')) return new Response(null, { status: 404 })
  const user = await currentUser()
  if (!user) return new Response(null, { status: 401 })
  const out = await voicePreview(user.id, (await params).id).catch(() => null)
  if (out === 'pending') return new Response(null, { status: 202 })
  if (!out) return new Response(null, { status: 404 })
  return new Response(out, { headers: { 'content-type': 'audio/wav', 'cache-control': 'private, no-store' } })
}
