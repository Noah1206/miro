import { NextRequest, NextResponse } from 'next/server'
import { homePage, popularHomeCards } from '@/lib/home'
import { measured, metric } from '@/lib/observe'

export async function GET(request: NextRequest) {
  const startedAt = performance.now()
  const params = request.nextUrl.searchParams
  const popular = params.get('sort') === 'popular'
  try {
    const data = popular
      ? await measured('api.home_popular_data', () => popularHomeCards())
      : await measured('api.home_page_data', () => homePage(params.get('cursor')))
    const elapsedMs = metric(popular ? 'api.home_popular_total' : 'api.home_page_total', startedAt)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store', 'Server-Timing': `app;dur=${elapsedMs}` } })
  } catch (error) {
    metric(popular ? 'api.home_popular_total' : 'api.home_page_total', startedAt, false)
    const invalid = error instanceof Error && error.message === 'INVALID_CURSOR'
    return NextResponse.json({ error: invalid ? 'invalid_cursor' : 'unavailable' }, { status: invalid ? 400 : 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
