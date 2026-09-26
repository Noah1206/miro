import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { ringingFor } from '@/lib/call/service'

export const dynamic = 'force-dynamic'

/** 지금 울리는 통화 — RingWatcher 가 몇 초마다 묻고, 온 정보로 수신 화면을 바로 그린다. */
export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ call: null }, { status: 401 })
  const call = await ringingFor(user.id)
  return NextResponse.json({ call: call ? { id: call.id, channel: call.channel, reason: call.reason, characterName: call.characterName } : null },
    { headers: { 'Cache-Control': 'no-store' } })
}
