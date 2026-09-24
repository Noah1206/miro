import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { endCall } from '@/lib/call/service'

/**
 * 통화 화면을 떠날 때 브라우저가 보내는 종료 신호(sendBeacon). 종료 버튼 없이 창을 닫아도 실제 통화 시간으로 끝낸다.
 * 쿠키로 본인 통화만 끝낼 수 있고, 다른 사이트에서 보낸 요청은 받지 않는다.
 */
export async function POST(req: Request, { params }: { params: Promise<{ callId: string }> }) {
  const origin = req.headers.get('origin')
  if (origin && new URL(origin).host !== req.headers.get('host')) return new NextResponse(null, { status: 403 })
  const { callId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callId)) return new NextResponse(null, { status: 404 })
  const user = await currentUser()
  if (!user) return new NextResponse(null, { status: 401 })
  await endCall(user.id, callId, 'closed')
  return new NextResponse(null, { status: 204 })
}
