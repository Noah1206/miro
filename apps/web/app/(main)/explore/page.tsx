import { Suspense } from 'react'
import { currentUser } from '@/lib/auth'
import { homeCatalog } from '@/lib/home'
import { availableDiscoveryGroups } from '@/lib/discovery-filters'
import { Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { SearchScreen } from '../search/screen'
import styles from '../search/search.module.css'

export async function generateMetadata() { const t = await getT(); return { title: t('탐색') } }

export default async function Explore() {
  const user = await currentUser()
  // 11/12 사용자: 로그인 전에도 탐색할 수 있다(성인 표지는 흐림).
  // 11/22 사용자: 처음 목록은 Rank(대화량 순) — 화면도 같은 정렬 키로 받아 다시 부르지 않는다.
  const { items } = await homeCatalog(user?.id ?? null, { sort: 'ranking' })
  return <Page immersive wide className={styles.page}>
    <Suspense><SearchScreen isResults resultsPath="/explore" groups={availableDiscoveryGroups(items)} filterCatalog={items} initialPage={{ items, nextCursor: null }} initialKey="sort=ranking" /></Suspense>
  </Page>
}
