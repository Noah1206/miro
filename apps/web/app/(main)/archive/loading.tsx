import { Skeleton } from '@/components/ui'
export default function Loading() {
  return <div role="status" aria-label="불러오는 중" className="page"><Skeleton h={28} w={60} style={{ marginBottom: 20 }} /><div className="stack" style={{ gap: 10 }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={96} r="var(--radius-lg)" />)}</div></div>
}
