import { currentUser } from '@/lib/auth'
import { searchPage } from '@/lib/home'
import { Page, TransitionLink } from '@/components/ui'
import { SearchResultsSkeleton } from '@/components/page-skeletons'
import { SearchHeader } from './search'
import { SearchGrid } from './grid'
import styles from './search.module.css'
import { measured } from '@/lib/observe'
import { searchGenres, searchQuery, searchUrl } from '@/lib/search-params'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'

async function SearchResults({ viewerId, q, tag, genres }: { viewerId: string | null; q: string; tag: string | null; genres: string[] }) {
  let failed = false
  const page = await measured('nav.search_data', () => searchPage(viewerId, q, null, tag, genres)).catch(() => {
    failed = true
    return { items: [], nextCursor: null }
  })
  return <SearchGrid key={JSON.stringify([viewerId, q, tag, genres])} query={q} tag={tag} genres={genres} viewerId={viewerId} initial={page} initialError={failed} />
}

export default async function HomeSearch({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; genre?: string | string[]; type?: string | string[] }> }) {
  const [user, params] = await Promise.all([currentUser(), searchParams])
  const q = searchQuery(params.q ?? '')
  const tag = params.tag === undefined ? null : searchQuery(params.tag)
  const rawGenres = params.genre === undefined ? [] : Array.isArray(params.genre) ? params.genre : [params.genre]
  const genres = searchGenres(rawGenres)
  if (!genres) notFound()
  if (params.type !== undefined || JSON.stringify(rawGenres) !== JSON.stringify(genres)) redirect(searchUrl('/home/search', q, tag, genres))
  const viewerId = user?.id ?? null

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
      <SearchHeader q={q} tag={tag} genres={genres} viewerId={viewerId} base="/home/search">
        <TransitionLink href="/home" direction="back" aria-label="홈으로 돌아가기" className="hit"
          style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, color: 'var(--color-text-primary)' }}>
          <svg aria-hidden width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5 8 12l7 7" /></svg>
        </TransitionLink>
      </SearchHeader>

      <div className={styles.results}>
        <Suspense key={JSON.stringify([viewerId, q, tag, genres])} fallback={<SearchResultsSkeleton />}>
          <SearchResults viewerId={viewerId} q={q} tag={tag} genres={genres} />
        </Suspense>
      </div>
    </Page>
  )
}
