import { Suspense } from 'react'
import { Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { SearchScreen } from './screen'
export async function generateMetadata() { const t = await getT(); return { title: t('검색') } }
export default function SearchPage() {
  return <Page immersive wide><Suspense><SearchScreen /></Suspense></Page>
}
