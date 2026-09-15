import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { listSessions } from '@/lib/ops/archive'
import { Page, Reveal, TransitionLink } from '@/components/ui'
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
        <Reveal>
          <header style={{ marginBottom: 'var(--space-6)' }}>
            <h1 className="t-title-1" style={{ marginBottom: 6 }}>내 채팅</h1>
          </header>
          <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            <p className="t-caption" style={{ marginBottom: 'var(--space-5)' }}>진행 중인 역할극이 없습니다.</p>
            <p className="t-caption"><TransitionLink href="/home" style={{ textDecoration: 'underline' }}>캐릭터 둘러보기</TransitionLink> · <TransitionLink href="/create" style={{ textDecoration: 'underline' }}>직접 만들기</TransitionLink></p>
          </div>
        </Reveal>
      ) : <ArchiveList items={items} />}
    </Page>
  )
}
