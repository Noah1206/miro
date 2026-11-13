import type { Metadata } from 'next'
import { currentUser } from '@/lib/auth'
import { LogoMark } from '@/components/ui/logo'
import { HomeViewBeacon } from '@/app/(main)/home/view-beacon'
import { Quiz } from './quiz'

const TITLE = '당신의 성향은? 미로가 찍어 드립니다'
const DESC = '캐릭터챗에서 내가 끌리는 전개 테스트 · 8문항 · 30초 · 로그인 없음'
export const metadata: Metadata = { description: DESC, openGraph: { title: TITLE, description: DESC, url: '/test' }, twitter: { card: 'summary_large_image', title: TITLE, description: DESC } }

/** 성향 테스트(11/13, 홍보용) — 로그인 없이 누구나. 방문은 홈 방문과 같은 기록으로 남는다(utm_source 로 채널 구분). */
export default async function TestPage() {
  const user = await currentUser()
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', alignContent: 'center', padding: 'var(--space-6) var(--gutter)' }}>
      <div style={{ width: '100%', maxWidth: 440, margin: '0 auto', display: 'grid', gap: 'var(--space-6)' }}>
        <a href="/home" aria-label="MIRO 홈" style={{ justifySelf: 'center' }}><LogoMark size={36} /></a>
        <Quiz />
      </div>
      <HomeViewBeacon signedIn={!!user} />
    </main>
  )
}
