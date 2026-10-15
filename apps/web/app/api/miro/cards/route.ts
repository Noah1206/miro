import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { miroCatalog } from '@/lib/home'
import { measured, metric } from '@/lib/observe'

export async function GET() {
  const startedAt = performance.now()
  try {
    const user = await measured('api.miro_auth', () => currentUser())
    const page = await measured('api.miro_data', () => miroCatalog(user?.id ?? null))
    const elapsedMs = metric('api.miro_total', startedAt)
    return NextResponse.json(page, { headers: { 'Cache-Control': 'private, no-store', 'Server-Timing': `app;dur=${elapsedMs}` } })
  } catch (error) {
    metric('api.miro_total', startedAt, false)
    const invalid = error instanceof Error && error.message === 'INVALID_CURSOR'
    return NextResponse.json({ error: invalid ? 'invalid_cursor' : 'unavailable' }, { status: invalid ? 400 : 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
