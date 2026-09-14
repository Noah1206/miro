import { currentUser } from '@/lib/auth'
import { discoverGrid, type HomeCard } from '@/lib/home'
import { LogoMark, Page } from '@/components/ui'
import { CharacterCard } from '@/components/character-card'
import { SearchHeader } from './search'

/**
 * 발견 — 행이 아니라 2열 그리드로 한 번에 훑는다 (레퍼런스).
 * 홈이 '주제별로 고르는 곳' 이라면 여기는 '전부 보는 곳' 이다. 검색은 ?q= 로 — 주소를 공유하면 같은 결과가 열린다.
 */
export default async function Discover({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [user, { q: rawQ }] = await Promise.all([currentUser(), searchParams])
  const q = (rawQ ?? '').trim().slice(0, 40)
  const all = await discoverGrid(user?.id ?? null)
  const items = q ? all.filter((c) => matches(c, q)) : all

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
      <SearchHeader q={q}>
        <LogoMark size={22} />
        <h1 className="t-title-2" style={{ margin: 0 }}>발견</h1>
      </SearchHeader>

      {items.length === 0 ? (
        <p className="t-caption" style={{ padding: '0 var(--gutter)', color: 'var(--color-text-tertiary)' }}>
          {q ? `'${q}'에 맞는 캐릭터가 없어요.` : '아직 보여드릴 캐릭터가 없어요.'}
        </p>
      ) : (
        <>
          {q && <p className="t-micro" style={{ padding: '0 var(--gutter)', marginBottom: 10, textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{items.length}개</p>}
          <div className="grid-2" style={{ padding: '0 var(--gutter)' }}>
            {items.map((c) => <CharacterCard key={c.id} c={c} />)}
          </div>
        </>
      )}
    </Page>
  )
}

/** 이름·소개·직업·분위기(장르)·관계 키워드 어디에든 들어 있으면 잡는다. 대소문자·공백은 무시. */
function matches(c: HomeCard, q: string): boolean {
  const needle = q.replace(/\s+/g, '').toLowerCase()
  const hay = [c.name, c.tagline, c.occupation, c.role, c.genre, ...c.relationshipKeywords].filter(Boolean).join(' ').replace(/\s+/g, '').toLowerCase()
  return hay.includes(needle)
}
