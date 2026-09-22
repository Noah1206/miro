import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { listSessions } from '@/lib/ops/archive'
import { Page, Reveal } from '@/components/ui'
import { ArchiveList } from './list'

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { deleted } = await searchParams
  // 진행 중과 보관됨을 나누지 않는다 — 한 목록에서 진행 중이 위에 온다.
  const items = await listSessions(user.id)
  return (
    <Page>
      {deleted && <p role="status" className="t-caption" style={{ marginBottom: 12 }}>역할극을 삭제했습니다.</p>}
      {items.length === 0 ? (
        // Reveal 은 .page 와 빈 상태 사이의 감싸개라, 빈 상태가 늘어나도록 함께 세로로 늘어난다.
        <Reveal style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <header style={{ marginBottom: 'var(--space-6)' }}>
            <h1 className="t-title-1" style={{ marginBottom: 6 }}>내 채팅</h1>
          </header>
          <p className="empty-state empty-state--fill">진행 중인 역할극이 없습니다.</p>
        </Reveal>
      ) : <ArchiveList items={items} />}
    </Page>
  )
}
