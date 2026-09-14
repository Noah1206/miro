import { currentUser } from '@/lib/auth'
import { discoverGrid } from '@/lib/home'
import { LogoMark, Page, Tip } from '@/components/ui'
import { CharacterCard } from '@/components/character-card'

/**
 * 발견 — 행이 아니라 2열 그리드로 한 번에 훑는다 (레퍼런스).
 * 홈이 '주제별로 고르는 곳' 이라면 여기는 '전부 보는 곳' 이다.
 */
export default async function Discover() {
  const user = await currentUser()
  const items = await discoverGrid(user?.id ?? null)

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--space-5)' }}>
        <LogoMark size={22} />
        <h1 className="t-title-2" style={{ margin: 0 }}>발견</h1>
      </header>
      <Tip id="discover" style={{ margin: '0 var(--space-5) var(--space-4)' }}>공식 캐릭터와 사람들이 공개한 캐릭터를 한 번에 봅니다.</Tip>

      {items.length === 0 ? (
        <p className="t-caption" style={{ padding: '0 var(--space-5)', color: 'var(--color-text-tertiary)' }}>
          아직 보여드릴 캐릭터가 없어요.
        </p>
      ) : (
        <div className="grid-2" style={{ padding: '0 var(--space-5)' }}>
          {items.map((c) => <CharacterCard key={c.id} c={c} />)}
        </div>
      )}
    </Page>
  )
}
