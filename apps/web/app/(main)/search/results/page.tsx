import { Suspense } from 'react'
import { Page } from '@/components/ui'
import { currentUser } from '@/lib/auth'
import { homeCatalog, shuffledCards } from '@/lib/home'
import { availableDiscoveryGroups } from '@/lib/discovery-filters'
import { getT } from '@/lib/i18n/server'
import { SearchScreen } from '../screen'
import styles from '../search.module.css'

export async function generateMetadata() { const t = await getT(); return { title: t('검색 결과') } }

export default async function SearchResultsPage() {
  const user = await currentUser()
  const { items } = await homeCatalog(user?.id ?? null)
  return <Page immersive wide className={styles.page}><Suspense><SearchScreen isResults groups={availableDiscoveryGroups(items)} filterCatalog={items} initialPage={{ items: shuffledCards(items), nextCursor: null }} /></Suspense></Page>
}
