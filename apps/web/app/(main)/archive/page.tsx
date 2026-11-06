import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { listSessions } from '@/lib/ops/archive'
import { Page } from '@/components/ui'
import { ArchiveList } from './list'
import { measured } from '@/lib/observe'
import { getT } from '@/lib/i18n/server'
import styles from './list.module.css'
import { PushGuide } from './push-guide'

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
      {/* 11/7 사용자: 알림을 안 켰으면 목록 위에서 켜는 길을 바로 알려 준다. */}
      <PushGuide vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      <ArchiveList key={channel} initialPage={page} channel={channel} />
    </Page>
  )
}
