import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { listSessions } from '@/lib/ops/archive'
import { Page, Reveal, Tabs, TransitionLink } from '@/components/ui'
import { ArchiveList } from './list'
import { archive, restore } from './actions'

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ tab?: string; deleted?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { tab, deleted } = await searchParams
  const status = tab === 'archived' ? 'archived' : 'active'
  const items = await listSessions(user.id, status)
  return (
    <Page>
      <h1 className="t-title-1" style={{ marginBottom: 'var(--space-4)' }}>인연</h1>
      <Tabs id="archive" active={status} tabs={[{ key: 'active', label: '진행 중', href: '/archive' }, { key: 'archived', label: '보관됨', href: '/archive?tab=archived' }]} />
      <div style={{ height: 'var(--space-5)' }} />
      {deleted && <p role="status" className="t-caption" style={{ marginBottom: 12 }}>역할극을 삭제했습니다.</p>}
      {items.length === 0 ? (
        <Reveal>
          <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            <p className="t-title-3 t-quote" style={{ marginBottom: 6 }}>{status === 'active' ? '아직 이어진 인연이 없어요.' : '보관된 인연이 없어요.'}</p>
            <p className="t-caption" style={{ marginBottom: 'var(--space-5)' }}>{status === 'active' ? '진행 중인 역할극이 없습니다.' : '보관된 역할극이 없습니다.'}</p>
            <p className="t-caption"><TransitionLink href="/home" style={{ textDecoration: 'underline' }}>누군가의 세계에 들어가 보세요</TransitionLink> · <TransitionLink href="/create" style={{ textDecoration: 'underline' }}>직접 만들기</TransitionLink></p>
          </div>
        </Reveal>
      ) : <ArchiveList items={items} archived={status === 'archived'} archiveAction={archive} restoreAction={restore} />}
    </Page>
  )
}
