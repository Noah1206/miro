import { currentUser } from '@/lib/auth'
import { homeCatalog } from '@/lib/home'
import { measured } from '@/lib/observe'
import { Page, PageHeader } from '@/components/ui'
import { searchGenres } from '@/lib/search-params'
import { getT } from '@/lib/i18n/server'
import { HomeFeed } from '../home/feed'

/** 탐색 = 예전 홈의 전체 목록(정렬 탭·장르 필터, 10/19). ?genre= 는 홈 장르 줄의 '전체 보기'에서 온다. */
export default async function Explore({ searchParams }: { searchParams: Promise<{ genre?: string | string[] }> }) {
  const { genre } = await searchParams
  const genres = searchGenres([genre ?? []].flat()) ?? []
  const [user, t] = await Promise.all([currentUser(), getT()])
  const page = await measured('nav.explore_data', () => homeCatalog(user?.id ?? null, { genres }))
  return (
    <Page immersive wide style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-3))' }}>
      {/* 홈처럼 immersive — 피드가 자기 여백(.feed)을 가진다. */}
      <div style={{ padding: 'calc(var(--space-4) + env(safe-area-inset-top)) var(--gutter) 0' }}><PageHeader title={genres.length ? genres.join(' · ') : t('탐색')} /></div>
      <HomeFeed key={genres.join('|')} initial={page} genres={genres} />
    </Page>
  )
}
