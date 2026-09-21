import { currentUser } from '@/lib/auth'
import { discoverGrid, type HomeCard } from '@/lib/home'
import { ButtonLink, LogoMark, Page } from '@/components/ui'
import { CharacterCard } from '@/components/character-card'
import { SearchHeader } from './search'

/**
 * 일반 캐릭터 검색 — 홈이 '주제별로 고르는 곳' 이라면 여기는 '전부 보는 곳' 이다.
 * 2열 그리드로 한 번에 훑고, 검색은 ?q= 로 — 주소를 공유하면 같은 결과가 열린다.
 * 미로(reality) 캐릭터는 여기 나오지 않는다. 그쪽은 /miro.
 */
export default async function HomeSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [user, { q: rawQ }] = await Promise.all([currentUser(), searchParams])
  const q = (rawQ ?? '').trim().slice(0, 40)
  const all = await discoverGrid(user?.id ?? null, 'chat')
  const items = q ? all.filter((c) => matches(c, q)) : all

  return (
    <Page immersive style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-6))' }}>
      <SearchHeader q={q} base="/home/search">
        <LogoMark size={22} />
        <h1 className="t-title-2" style={{ margin: 0 }}>검색</h1>
      </SearchHeader>

      {items.length === 0 ? (
        <div className="stack" style={{ padding: '0 var(--gutter)', gap: 14, alignItems: 'flex-start' }}>
          <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>
            {q ? `'${q}'에 맞는 캐릭터가 없어요. 다른 키워드로 찾아보거나, 직접 만들 수 있어요.` : '아직 보여드릴 캐릭터가 없어요. 첫 캐릭터를 직접 만들 수 있어요.'}
          </p>
          <ButtonLink href="/create" variant="secondary" size="sm">캐릭터 만들기</ButtonLink>
        </div>
      ) : (
        <>
          {q && <p className="t-micro" style={{ padding: '0 var(--gutter)', marginBottom: 10, textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{items.length}개</p>}
          <div className="grid-2" style={{ gap: 4, padding: '0 var(--gutter)' }}>
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
