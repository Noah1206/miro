import { currentUser } from '@/lib/auth'
import { homeRows } from '@/lib/home'
import { LoginButton, LogoMark, Page, TransitionLink } from '@/components/ui'
import { IncomingCall } from '@/components/incoming-call'
import { HomeFeed } from './feed'

/** 로그인했다는 표시. 이름이나 이메일의 첫 글자를 담고, 누르면 내 정보로 간다. */
function ProfileBadge({ label, name }: { label: string; name: string }) {
  return (
    <TransitionLink href="/my" aria-label={`${name} · 내 정보`} className="hit"
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
      {/* 위 여백은 8px 만 — 홈 화면에 추가한 앱에서는 상태 표시줄(safe-area)만큼 더 내린다. */}
      {/* 내용 높이 40 = 세 탭(홈·미로·검색) 공통 — 탭을 옮겨도 마크가 같은 자리에 있다. */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, boxSizing: 'content-box', padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--gutter) var(--space-5)' }}>
        {/* 마크 하나만 — 글자 없이 마크가 이름을 맡는다. 오른쪽 아이콘 상자(34px)와 눈높이가 맞는 크기. */}
        <LogoMark size={30} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TransitionLink href="/home/search" aria-label="캐릭터 검색" className="hit" style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, color: 'var(--color-text-primary)' }}>
            <svg aria-hidden width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          </TransitionLink>
          {user
          ? <ProfileBadge label={initial(user)} name={user.displayName ?? user.email ?? '내 정보'} />
          // 헤더에서는 검색 아이콘 상자(38px)와 같은 눈높이 — 글자를 키우고 채움은 글자에 붙인다. 터치 영역은 .hit 이 44px 로 넓힌다.
          : <LoginButton variant="primary" size="sm" className="hit" style={{ minHeight: 34, padding: '0 9px', fontSize: 14 }}>로그인</LoginButton>}
        </div>
      </header>

      <HomeFeed rows={rows} />
    </Page>
  )
}
