import { OAUTH_LABEL, resolveOAuth, type OAuthProviderId } from '@miro/providers'
import { Nav } from '@/components/ui/nav'
import { LoginSheetProvider } from '@/components/ui/login-sheet'
import { currentUser } from '@/lib/auth'

const IDS: OAuthProviderId[] = ['google', 'kakao']

/** 모바일: 하단 내비 + 페이지. 데스크톱: 왼쪽 내비 + 메인. 장면 화면(chat/live/call)에서는 내비가 스스로 사라진다. */
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  // 비로그인 사용자에게는 로그인을 화면 이동 대신 시트로 묻는다. 보던 화면을 잃지 않게 한다.
  const user = await currentUser()
  const providers = user ? [] : IDS.filter(id => resolveOAuth(id)).map(id => ({ id, label: OAUTH_LABEL[id] }))
  return (
    <LoginSheetProvider providers={providers}>
      <div className="app-shell">
        <Nav signedIn={!!user} />
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </LoginSheetProvider>
  )
}
