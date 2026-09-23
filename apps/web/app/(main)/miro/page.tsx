import { currentUser } from '@/lib/auth'
import { discoverGrid } from '@/lib/home'
import { LogoMark, Page } from '@/components/ui'
import { CharacterCard } from '@/components/character-card'

/**
 * 미로 — Reality 전용 캐릭터만. 카드 → 상세 → 대화 진입은 홈과 같은 길을 쓴다.
 * 설명 문구로 차이를 말하지 않는다. 대화 뒤에 오는 연락이 차이를 보여준다.
 * 가짜 온라인 표시나 아직 없는 연락을 그리지 않는다.
 */
export default async function Miro() {
  const user = await currentUser()
  const items = await discoverGrid(user?.id ?? null, 'reality')

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--space-5) var(--space-5) var(--space-4)' }}>
        <LogoMark size={30} />
        {/* 보이는 제목은 없다 — 탭이 이미 '미로' 다. 제목은 읽어 주는 기기만 듣는다. */}
        <h1 className="sr-only">미로</h1>
      </header>

      {items.length === 0 ? (
        <p data-miro-empty className="empty-state empty-state--fill">아직 미로에 있는 캐릭터가 없어요</p>
      ) : (
        <div data-miro-grid className="grid-2" style={{ gap: 4, padding: '0 var(--gutter)' }}>
          {items.map((c) => <CharacterCard key={c.id} c={c} />)}
        </div>
      )}
    </Page>
  )
}
