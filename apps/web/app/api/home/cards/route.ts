import { NextRequest, NextResponse } from 'next/server'
import { homePage, popularHomeCards } from '@/lib/home'
import { currentUser } from '@/lib/auth'
import { measured, metric } from '@/lib/observe'

export async function GET(request: NextRequest) {
  const startedAt = performance.now()
  const params = request.nextUrl.searchParams
  const popular = params.get('sort') === 'popular'
  const sortValue = params.get('sort') ?? 'latest'
  // 홈 칩(2026-09-30) — genre·relation 을 여러 번 보내면 그 종류 안에서는 하나라도, 두 종류는 둘 다 맞는 캐릭터.
  const genres = params.getAll('genre')
  try {
    if (!['latest', 'ranking', 'reviews', 'popular'].includes(sortValue)) throw new Error('INVALID_SORT')
    const data = popular
      ? await measured('api.home_popular_data', () => popularHomeCards(genres))
      : await measured('api.home_page_data', async () => homePage((await currentUser())?.id ?? null, params.get('cursor'), { genres, relations: params.getAll('relation'), query: params.get('q') ?? '', sort: sortValue as 'latest' | 'ranking' | 'reviews' }))
    const elapsedMs = metric(popular ? 'api.home_popular_total' : 'api.home_page_total', startedAt)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store', 'Server-Timing': `app;dur=${elapsedMs}` } })
  } catch (error) {
    metric(popular ? 'api.home_popular_total' : 'api.home_page_total', startedAt, false)
    const invalid = error instanceof Error && (error.message === 'INVALID_CURSOR' || error.message === 'INVALID_GENRE' || error.message === 'INVALID_SORT')
    return NextResponse.json({ error: invalid ? error.message.toLowerCase() : 'unavailable' }, { status: invalid ? 400 : 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
