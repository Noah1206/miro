import { OAUTH_LABEL, resolveOAuth, type OAuthProviderId } from '@miro/providers'
import { Nav } from '@/components/ui/nav'
import { NavigationFeedback } from '@/components/navigation-feedback'
import { LoginSheetProvider } from '@/components/ui/login-sheet'
import { currentUser } from '@/lib/auth'
import { IncomingCall } from '@/components/incoming-call'
import { PushSubscribe } from '@/components/push-subscribe'
import { measured } from '@/lib/observe'
import { WalletProvider } from '@/components/wallet/provider'

const IDS: OAuthProviderId[] = ['google', 'kakao']

/** 모바일: 하단 내비 + 페이지. 데스크톱: 왼쪽 내비 + 메인. 장면 화면(chat/live/call)에서는 내비가 스스로 사라진다. */
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  // 비로그인 사용자에게는 로그인을 화면 이동 대신 시트로 묻는다. 보던 화면을 잃지 않게 한다.
  const user = await measured('nav.layout_auth', () => currentUser())
  const providers = user ? [] : IDS.filter(id => resolveOAuth(id)).map(id => ({ id, label: OAUTH_LABEL[id] }))
  return (
    <LoginSheetProvider providers={providers}>
      <WalletProvider><div className="app-shell">
        {/* 캐릭터가 거는 전화는 어느 화면에서든 울린다. */}
        {user && <IncomingCall userId={user.id} />}
        {/* 로그인해서 들어오면 어디서든 먼저 알림을 켜자고 묻는다 — 세션에 한 번(2026-09-29). */}
        {user && <PushSubscribe autoPrompt vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} name="캐릭터" />}
        <Nav signedIn={!!user} userId={user?.id} />
        <div style={{ minWidth: 0 }}><NavigationFeedback>{children}</NavigationFeedback></div>
      </div></WalletProvider>
    </LoginSheetProvider>
  )
}
