import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { searchPage } from '@/lib/home'
import { measured, metric } from '@/lib/observe'
import { searchGenres } from '@/lib/search-params'

export async function GET(request: NextRequest) {
  const startedAt = performance.now()
  try {
    const genres = searchGenres(request.nextUrl.searchParams.getAll('genre'))
    if (!genres) return NextResponse.json({ error: 'invalid_genre' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } })
    const user = await measured('api.search_auth', () => currentUser())
    const page = await measured('api.search_data', () => searchPage(user?.id ?? null, request.nextUrl.searchParams.get('q') ?? '', request.nextUrl.searchParams.get('cursor'), request.nextUrl.searchParams.has('tag') ? request.nextUrl.searchParams.get('tag') : null, genres))
    const elapsedMs = metric('api.search_total', startedAt)
    return NextResponse.json(page, { headers: { 'Cache-Control': 'private, no-store', 'Server-Timing': `app;dur=${elapsedMs}` } })
  } catch (error) {
    metric('api.search_total', startedAt, false)
    const invalid = error instanceof Error && (error.message === 'INVALID_CURSOR' || error.message === 'INVALID_GENRE')
    return NextResponse.json({ error: invalid ? error.message.toLowerCase() : 'unavailable' }, { status: invalid ? 400 : 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
