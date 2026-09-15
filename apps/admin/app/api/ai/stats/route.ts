import { NextResponse } from 'next/server'
import { currentAdmin } from '@/lib/auth'
import { aiStats } from '@/lib/ai'
export async function GET() {
  if (!await currentAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await aiStats(), { headers: { 'Cache-Control': 'private, no-store' } })
}
