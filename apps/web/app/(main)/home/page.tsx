import { currentUser } from '@/lib/auth'
import { homeRows } from '@/lib/home'
import { ButtonLink, LogoMark, Page, TransitionLink, Tip } from '@/components/ui'
import { IncomingCall } from '@/components/incoming-call'
import { Row } from './row'

/** 로그인했다는 표시. 이름이나 이메일의 첫 글자를 담고, 누르면 내 정보로 간다. */
function ProfileBadge({ label, name }: { label: string; name: string }) {
  return (
    <TransitionLink href="/my" aria-label={`${name} · 내 정보`}
      style={{
        display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 17,
        background: 'var(--color-surface-2)', color: 'var(--color-text-primary)',
        fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-semibold)',
      }}>
      <span aria-hidden>{label}</span>
    </TransitionLink>
  )
}

/** 표시할 글자 한 자. 한글이면 그대로, 영문이면 대문자로. */
function initial(user: { displayName: string | null; email: string | null }): string {
  const source = (user.displayName ?? user.email ?? '').trim()
  return source ? source.slice(0, 1).toUpperCase() : '나'
}

/** 홈은 캐릭터 목록이 아니라 세계로 들어가는 입구다 — 주제를 가진 행으로 훑는다 (명세서 2.1). */
export default async function Home() {
  const user = await currentUser()
  const rows = await homeRows(user?.id ?? null)

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
      {user && <IncomingCall userId={user.id} />}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-5) var(--space-5) var(--space-5)' }}>
        <LogoMark size={22} />
        <h1 className="sr-only">한 사람의 세계 안으로</h1>
        {user
          ? <ProfileBadge label={initial(user)} name={user.displayName ?? user.email ?? '내 정보'} />
          : <ButtonLink href="/login" variant="secondary" size="sm">로그인</ButtonLink>}
      </header>
      <div style={{ padding: '0 var(--space-5)', marginBottom: 'var(--space-4)' }}><Tip id="home">카드를 누르면 그 사람을 먼저 살펴볼 수 있어요. 대화는 상세에서 시작합니다.</Tip></div>

      <div>
        {rows.map((row, i) => <Row key={row.key} row={row} index={i} />)}

      </div>
    </Page>
  )
}
