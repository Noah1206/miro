import { NextRequest, NextResponse } from 'next/server'
import { homePage, popularHomeCards } from '@/lib/home'
import { currentUser } from '@/lib/auth'
import { measured, metric } from '@/lib/observe'

export async function GET(request: NextRequest) {
  const startedAt = performance.now()
  const params = request.nextUrl.searchParams
  const popular = params.get('sort') === 'popular'
  // reality=1 — 홈의 R 토글: 앱 밖 연락이 켜진 미로 캐릭터만.
  const contactOnly = params.get('reality') === '1'
  try {
    const data = popular
      ? await measured('api.home_popular_data', () => popularHomeCards(contactOnly))
      : await measured('api.home_page_data', async () => homePage((await currentUser())?.id ?? null, params.get('cursor'), contactOnly))
    const elapsedMs = metric(popular ? 'api.home_popular_total' : 'api.home_page_total', startedAt)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store', 'Server-Timing': `app;dur=${elapsedMs}` } })
  } catch (error) {
    metric(popular ? 'api.home_popular_total' : 'api.home_page_total', startedAt, false)
    const invalid = error instanceof Error && error.message === 'INVALID_CURSOR'
    return NextResponse.json({ error: invalid ? 'invalid_cursor' : 'unavailable' }, { status: invalid ? 400 : 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
