import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth'
import { absorbVoiceTurn, VOICE_TURN_MAX } from '@/lib/call/voice-turn'

const Turn = z.object({ user: z.string().max(VOICE_TURN_MAX * 2), character: z.string().min(1).max(VOICE_TURN_MAX * 2) })

/**
 * 실시간 음성 통화의 한 턴을 받는다. 브라우저가 받아쓰기(사용자·캐릭터)를 턴마다 순서대로 보낸다.
 * 쿠키로 본인 통화만, 같은 사이트에서 온 요청만 받는다.
 */
export async function POST(req: Request, { params }: { params: Promise<{ callId: string }> }) {
  const origin = req.headers.get('origin')
  if (origin && new URL(origin).host !== req.headers.get('host')) return new NextResponse(null, { status: 403 })
  const { callId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callId)) return new NextResponse(null, { status: 404 })
  const user = await currentUser()
  if (!user) return new NextResponse(null, { status: 401 })
  const parsed = Turn.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new NextResponse(null, { status: 400 })
  const outcome = await absorbVoiceTurn(user.id, callId, parsed.data.user, parsed.data.character)
  return NextResponse.json({ outcome }, { status: outcome === 'not_found' ? 404 : outcome === 'closed' ? 409 : 200 })
}
