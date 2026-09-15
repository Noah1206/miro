import { Skeleton } from '@/components/ui'
export default function Loading() {
  return <main id="main" aria-busy="true" role="status" aria-label="불러오는 중" className="page">
    <Skeleton h={24} w={85} style={{ marginBottom: 24 }} />
    <Skeleton h={76} r="12px" style={{ marginBottom: 28 }} />
    <Skeleton h={26} w="80%" style={{ marginBottom: 18 }} />
    <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={40} w={65} r="22px" />)}</div>
    <Skeleton h={18} w={125} style={{ marginBottom: 14 }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>{[0, 1].map(i => <div key={i}>
      <Skeleton h="auto" style={{ aspectRatio: '4 / 5' }} /><Skeleton h={16} w="60%" style={{ marginTop: 12 }} /><Skeleton h={30} style={{ marginTop: 8 }} />
    </div>)}</div>
  </main>
}
