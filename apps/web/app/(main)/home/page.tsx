import { currentUser } from '@/lib/auth'
import { homeRows } from '@/lib/home'
import { ButtonLink, LogoMark, Page } from '@/components/ui'
import { IncomingCall } from '@/components/incoming-call'
import { Row } from './row'

/** 홈은 캐릭터 목록이 아니라 세계로 들어가는 입구다 — 주제를 가진 행으로 훑는다 (명세서 2.1). */
export default async function Home() {
  const user = await currentUser()
  const rows = await homeRows(user?.id ?? null)

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
      {user && <IncomingCall userId={user.id} />}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-5) var(--space-5) var(--space-5)' }}>
        <LogoMark size={22} />
        {user
          ? <h1 className="t-micro" style={{ margin: 0 }}>한 사람의 세계 안으로</h1>
          : (
            <>
              <h1 className="sr-only">한 사람의 세계 안으로</h1>
              <ButtonLink href="/login" variant="secondary" size="sm">로그인</ButtonLink>
            </>
          )}
      </header>

      <div>
        {rows.map((row, i) => <Row key={row.key} row={row} index={i} />)}

      </div>
    </Page>
  )
}
