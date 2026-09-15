import { Skeleton } from '@/components/ui'

export default function Loading() {
  return <main id="main" className="page" aria-busy="true" role="status" aria-label="내 정보 불러오는 중">
    <Skeleton h={100} style={{ marginBottom: 24 }} />
    <Skeleton h={24} w={100} style={{ marginBottom: 16 }} />
    <div className="grid-2" style={{ gap: 4 }}>
      {[0, 1].map(i => <Skeleton key={i} h="auto" style={{ aspectRatio: '5 / 8' }} />)}
    </div>
  </main>
}
