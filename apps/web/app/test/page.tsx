import type { Metadata } from 'next'
import { currentUser } from '@/lib/auth'
import { LogoMark } from '@/components/ui/logo'
import { HomeViewBeacon } from '@/app/(main)/home/view-beacon'
import { Quiz } from './quiz'

const TITLE = '현생에선 아무도 모르는 내 취향, 내 최애 히로인은 어떤 유형일까?'
const DESC = '12가지 상황으로 알아보는 내 최애 히로인 유형 테스트 · 1분 · 로그인 없음'
// 11/13 링크 미리보기 사진(1200×630) — 말풍선 제목·히로인 유형 태그·히로인 카드(public/quiz/og.jpg).
const IMAGES = [{ url: '/quiz/og.jpg', width: 1200, height: 630, alt: TITLE }]
export const metadata: Metadata = { description: DESC, openGraph: { title: TITLE, description: DESC, url: '/test', images: IMAGES }, twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: IMAGES } }

/** 취향 테스트(11/13, 홍보용) — 로그인 없이 누구나. 방문은 홈 방문과 같은 기록으로 남는다(utm_source 로 채널 구분). */
export default async function TestPage() {
  const user = await currentUser()
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', alignContent: 'center', padding: 'var(--space-6) var(--gutter)' }}>
      <div style={{ width: '100%', maxWidth: 768, margin: '0 auto', display: 'grid', gap: 'var(--space-6)' }}>
        <a href="/home" aria-label="MIRO 홈" style={{ justifySelf: 'center' }}><LogoMark size={36} /></a>
        <Quiz />
      </div>
      <HomeViewBeacon signedIn={!!user} />
    </main>
  )
}
