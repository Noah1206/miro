import { Suspense } from 'react'
import { currentUser } from '@/lib/auth'
import { homeCatalog, shuffledCards } from '@/lib/home'
import { availableDiscoveryGroups } from '@/lib/discovery-filters'
import { Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { SearchScreen } from '../search/screen'
import styles from '../search/search.module.css'

export async function generateMetadata() { const t = await getT(); return { title: t('탐색') } }

export default async function Explore() {
  const user = await currentUser()
  // 11/12 사용자: 로그인 전에도 탐색할 수 있다(성인 표지는 흐림).
  const { items } = await homeCatalog(user?.id ?? null)
  return <Page immersive wide className={styles.page}>
    <Suspense><SearchScreen isResults resultsPath="/explore" groups={availableDiscoveryGroups(items)} filterCatalog={items} initialPage={{ items: shuffledCards(items), nextCursor: null }} /></Suspense>
  </Page>
}
