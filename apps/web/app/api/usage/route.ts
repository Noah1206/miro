import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { usageStatus } from '@/lib/usage/guard'
export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const s = await usageStatus(user.id)
  return NextResponse.json({ plan: s.plan, period: s.period, usedPercent: s.usedPercent, resetsAt: s.resetsAt, continuityAvailable: s.continuityRemaining > 0 }, { headers: { 'Cache-Control': 'private, no-store' } })
}
