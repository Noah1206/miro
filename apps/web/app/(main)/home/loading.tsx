import { Skeleton } from '@/components/ui'
export default function Loading() {
  return (
    <div role="status" aria-label="불러오는 중" className="page page--immersive" style={{ padding: 'var(--space-5)', maxWidth: 720, margin: '0 auto' }}>
      <Skeleton h={22} w={80} style={{ marginBottom: 'var(--space-5)' }} />
      <Skeleton h="auto" r="var(--radius-lg)" style={{ aspectRatio: '4 / 5' }} />
      <Skeleton h={14} w={120} style={{ marginTop: 'var(--space-5)' }} />
      <Skeleton h={44} w={220} style={{ marginTop: 10 }} />
      <Skeleton h={56} r="var(--radius-button)" style={{ marginTop: 'var(--space-4)' }} />
    </div>
  )
}
