import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { ringingFor } from '@/lib/call/service'

export const dynamic = 'force-dynamic'

/** 지금 울리는 통화가 있는가 — RingWatcher 가 몇 초마다 묻는다. 내용은 화면이 다시 받아 그린다. */
export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ id: null }, { status: 401 })
  const call = await ringingFor(user.id)
  return NextResponse.json({ id: call?.id ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}
