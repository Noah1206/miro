import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { homeRows } from '@/lib/home'
import { ButtonLink, LogoMark, Page } from '@/components/ui'
import { PushSubscribe } from '@/components/push-subscribe'
import { IncomingCall } from '@/components/incoming-call'
import { Row } from './row'

/** 홈은 캐릭터 목록이 아니라 세계로 들어가는 입구다 — 주제를 가진 행으로 훑는다 (명세서 2.1). */
export default async function Home() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const rows = await homeRows(user.id)

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
      <IncomingCall userId={user.id} />
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-5) var(--space-5) var(--space-5)' }}>
        <LogoMark size={22} />
        <h1 className="t-micro" style={{ margin: 0 }}>한 사람의 세계 안으로</h1>
      </header>

      <div>
        {rows.map((row, i) => <Row key={row.key} row={row} index={i} />)}

        <div style={{ padding: '0 var(--space-5)', marginTop: 'var(--space-5)' }}>
          <ButtonLink href="/create" variant="secondary" size="lg" full>새로운 사람 만들기</ButtonLink>
        </div>
        <div style={{ padding: '0 var(--space-5)', marginTop: 'var(--space-6)' }}>
          <PushSubscribe vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
        </div>
      </div>
    </Page>
  )
}
