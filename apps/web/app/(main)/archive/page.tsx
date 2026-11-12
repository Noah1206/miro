import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { listSessions } from '@/lib/ops/archive'
import { Page } from '@/components/ui'
import { ArchiveList } from './list'
import { measured } from '@/lib/observe'
import { getT } from '@/lib/i18n/server'
import styles from './list.module.css'

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ deleted?: string; channel?:string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { deleted,channel:requestedChannel } = await searchParams
  const channel=requestedChannel==='dm'?'dm':'chat'
  const t = await getT()
  // 진행 중과 보관됨을 나누지 않는다 — 한 목록에서 진행 중이 위에 온다.
  const page = await measured('nav.archive_data', () => listSessions(user.id,{channel}))
  return (
    <Page wide className={styles.page}>
      {deleted && <p role="status" className="t-caption" style={{ marginBottom: 12 }}>{t('역할극을 삭제했습니다.')}</p>}
      <ArchiveList key={channel} initialPage={page} channel={channel} />
    </Page>
  )
}
