import { Skeleton } from '@/components/ui'
import { getT } from '@/lib/i18n/server'

export default async function Loading() {
  const t = await getT()
  return <main id="main" className="page" aria-busy="true" role="status" aria-label={t('발견 불러오는 중')}>
    <h1 className="t-title-2" style={{ marginBottom: 24 }}>{t('발견')}</h1>
    <div className="grid-2" style={{ gap: 4 }}>
      {[0, 1, 2, 3].map(i => <Skeleton key={i} h="auto" style={{ aspectRatio: '5 / 8' }} />)}
    </div>
  </main>
}
