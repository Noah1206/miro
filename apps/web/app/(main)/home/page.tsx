import { currentUser } from '@/lib/auth'
import { homeRows } from '@/lib/home'
import { ButtonLink, LogoMark, Page, TransitionLink } from '@/components/ui'
import { IncomingCall } from '@/components/incoming-call'
import { HomeFeed } from './feed'

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
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-5) var(--gutter) var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><LogoMark size={22} /><span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.08em' }}>MIRO</span></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TransitionLink href="/discover" aria-label="캐릭터 검색" style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, color: 'var(--color-text-primary)' }}>
            <svg aria-hidden width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          </TransitionLink>
          {user
          ? <ProfileBadge label={initial(user)} name={user.displayName ?? user.email ?? '내 정보'} />
          : <ButtonLink href="/login" variant="secondary" size="sm">로그인</ButtonLink>}
        </div>
      </header>

      <HomeFeed rows={rows} />
    </Page>
  )
}
