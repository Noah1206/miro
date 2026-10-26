import { Suspense } from 'react'
import { Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { SearchScreen } from './screen'
import { redirect } from 'next/navigation'
import styles from './search.module.css'
export async function generateMetadata() { const t = await getT(); return { title: t('검색') } }
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const incoming = await searchParams
  const params = new URLSearchParams()
  for (const key of ['q', 'tag', 'genre', 'relation']) {
    const values = incoming[key]
    for (const value of typeof values === 'string' ? [values] : values ?? []) if (value.trim()) params.append(key, value)
  }
  if (params.size) redirect(`/search/results?${params}`)
  return <Page immersive wide className={styles.page}><Suspense><SearchScreen /></Suspense></Page>
}
