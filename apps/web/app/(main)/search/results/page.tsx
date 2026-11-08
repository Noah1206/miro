import { redirect } from 'next/navigation'
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
  // 11/8 성인 서비스 — 로그인·본인인증 전에는 작품 목록·상세를 보이지 않는다(홈은 흐린 화면).
  if (!user) redirect('/home')
  const { items } = await homeCatalog(user?.id ?? null)
  return <Page immersive wide className={styles.page}><Suspense><SearchScreen isResults groups={availableDiscoveryGroups(items)} filterCatalog={items} initialPage={{ items: shuffledCards(items), nextCursor: null }} /></Suspense></Page>
}
