import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { listSessions } from '@/lib/ops/archive'
import { Page, Reveal, TransitionLink, Tip } from '@/components/ui'
import { ArchiveList } from './list'
import { archive, restore } from './actions'

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { deleted } = await searchParams
  // 진행 중과 보관됨을 나누지 않는다 — 한 목록에서 진행 중이 위에 온다.
  const items = await listSessions(user.id)
  return (
    <Page>
      <h1 className="t-title-1" style={{ marginBottom: 'var(--space-4)' }}>대화</h1>
      <Tip id="archive" style={{ marginBottom: 'var(--space-4)' }}>진행 중인 대화가 여기 모입니다. 누르면 저장된 장면에서 이어져요.</Tip>
      {deleted && <p role="status" className="t-caption" style={{ marginBottom: 12 }}>역할극을 삭제했습니다.</p>}
      {items.length === 0 ? (
        <Reveal>
          <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            <p className="t-title-3 t-quote" style={{ marginBottom: 6 }}>아직 이어진 인연이 없어요.</p>
            <p className="t-caption" style={{ marginBottom: 'var(--space-5)' }}>진행 중인 역할극이 없습니다.</p>
            <p className="t-caption"><TransitionLink href="/home" style={{ textDecoration: 'underline' }}>누군가의 세계에 들어가 보세요</TransitionLink> · <TransitionLink href="/create" style={{ textDecoration: 'underline' }}>직접 만들기</TransitionLink></p>
          </div>
        </Reveal>
      ) : <ArchiveList items={items} archiveAction={archive} restoreAction={restore} />}
    </Page>
  )
}
