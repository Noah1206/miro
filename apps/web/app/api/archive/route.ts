import { currentUser } from '@/lib/auth'
import { listSessions } from '@/lib/ops/archive'

/**
 * 대화 목록 첫 페이지(10/27). 보관함이 20초마다·포커스 때 이것만 다시 받는다 — 예전엔 router.refresh() 로 화면 전체를 다시 그려
 * 미리 받아 둔 탭·대화방이 지워졌다. 서버 액션이 아니라 GET 이라 라우터 대기열에 끼지 않아 그 사이 누른 이동을 늦추지 않는다.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await currentUser()
  if (!user) return new Response(null, { status: 401 })
  const channel = new URL(req.url).searchParams.get('channel') === 'dm' ? 'dm' : 'chat'
  return Response.json(await listSessions(user.id, { channel }), { headers: { 'cache-control': 'no-store' } })
}
