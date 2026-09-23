import { currentUser } from '@/lib/auth'
import { miroPage } from '@/lib/home'
import { LogoMark, Page } from '@/components/ui'
import { MiroGrid } from './grid'
import { measured } from '@/lib/observe'

/**
 * 미로 — Reality 전용 캐릭터만. 카드 → 상세 → 대화 진입은 홈과 같은 길을 쓴다.
 * 설명 문구로 차이를 말하지 않는다. 대화 뒤에 오는 연락이 차이를 보여준다.
 * 가짜 온라인 표시나 아직 없는 연락을 그리지 않는다.
 */
export default async function Miro() {
  const user = await currentUser()
  const page = await measured('nav.miro_data', () => miroPage(user?.id ?? null))

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
      {/* 홈과 같은 높이에 마크가 놓인다 — 탭을 옮겨도 마크가 뛰지 않게. */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, boxSizing: 'content-box', padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--gutter) var(--space-4)' }}>
        <LogoMark size={30} />
        {/* 보이는 제목은 없다 — 탭이 이미 '미로' 다. 제목은 읽어 주는 기기만 듣는다. */}
        <h1 className="sr-only">미로</h1>
      </header>

      <MiroGrid key={crypto.randomUUID()} initial={page} />
    </Page>
  )
}
