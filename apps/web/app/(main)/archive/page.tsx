import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { listSessions } from '@/lib/ops/archive'
import { Page } from '@/components/ui'
import { ArchiveList } from './list'
import { measured } from '@/lib/observe'

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { deleted } = await searchParams
  // 진행 중과 보관됨을 나누지 않는다 — 한 목록에서 진행 중이 위에 온다.
  const page = await measured('nav.archive_data', () => listSessions(user.id))
  return (
    <Page>
      {deleted && <p role="status" className="t-caption" style={{ marginBottom: 12 }}>역할극을 삭제했습니다.</p>}
      <ArchiveList initialPage={page} />
    </Page>
  )
}
